import { Router } from 'express'
import {
    parseJSON,
    differenceInSeconds,
    subSeconds,
    parseISO,
    addSeconds,
} from 'date-fns'
import { toISOString } from '../../utils/time'

import { v4 as uuid } from 'uuid'

import trace from '../../tracer'
import { set as cacheSet, get as cacheGet } from '../../cache'
import {
    NotFoundError,
    InvalidArgumentError,
    TripPatternExpiredError,
} from '../../errors'
import { verifyPartnerToken } from '../../auth'

import {
    RawSearchParams,
    SearchParams,
    TripPattern,
    TripPatternParsed,
    Leg,
} from '../../types'

import { getAlternativeTripPatterns } from '../../logic/otp1'
import {
    updateTripPattern,
    getExpires,
    getAlternativeLegs,
    getLeg,
} from '../../logic/otp2'
import { filterModesAndSubModes } from '../../logic/otp2/modes'

import { uniq } from '../../utils/array'
import { deriveSearchParamsId } from '../../utils/searchParams'

const SEARCH_PARAMS_EXPIRE_IN_SECONDS = 4 * 60 * 60 // four hours

const router = Router()

router.get<
    '/:id',
    { id: string },
    {
        tripPattern: TripPattern
        searchParams?: SearchParams | null
        expires?: Date
    }
>('/:id', async (req, res, next) => {
    try {
        const { id } = req.params
        const { update } = req.query
        const [tripPattern, searchParams] = await Promise.all([
            cacheGet<TripPattern>(`trip-pattern:${id}`),
            cacheGet<SearchParams>(
                `search-params:${deriveSearchParamsId(id)}`,
                SEARCH_PARAMS_EXPIRE_IN_SECONDS,
            ),
        ])

        if (!tripPattern) {
            if (searchParams) {
                throw new TripPatternExpiredError(
                    `Found no trip pattern with id ${id} expired but search params are still present`,
                    searchParams,
                )
            }
            throw new NotFoundError(
                `Found no trip pattern with id ${id}. Maybe cache entry expired?`,
            )
        }

        if (update) {
            const updatedTripPattern = await updateTripPattern(tripPattern)
            const expires = getExpires(updatedTripPattern)
            res.json({ tripPattern: updatedTripPattern, searchParams, expires })
        } else {
            res.json({ tripPattern, searchParams })
        }
    } catch (error) {
        next(error)
    }
})

router.post<
    '/',
    Record<string, never>,
    { tripPattern: TripPatternParsed },
    { tripPattern: TripPatternParsed; searchParams: SearchParams }
>('/', verifyPartnerToken, async (req, res, next) => {
    try {
        const { tripPattern, searchParams } = req.body

        if (!tripPattern) {
            throw new InvalidArgumentError(
                'Found no `tripPattern` key in body.',
            )
        }

        if (typeof tripPattern !== 'object') {
            throw new InvalidArgumentError(
                `\`tripPattern\` is invalid. Expected an object, got ${typeof tripPattern}`,
            )
        }

        const tripPatternId = tripPattern.id || uuid()
        const searchParamsId = deriveSearchParamsId(tripPatternId)

        const newTripPattern = {
            ...tripPattern,
            id: tripPatternId,
        }

        await Promise.all([
            cacheSet(`trip-pattern:${tripPatternId}`, newTripPattern),
            searchParams &&
                cacheSet(
                    `search-params:${searchParamsId}`,
                    searchParams,
                    SEARCH_PARAMS_EXPIRE_IN_SECONDS,
                ),
        ])

        res.status(201).json({ tripPattern: newTripPattern })
    } catch (error) {
        next(error)
    }
})

function getParams(params: RawSearchParams): SearchParams {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()
    const modes = filterModesAndSubModes(params.searchFilter)

    return {
        ...params,
        searchDate,
        initialSearchDate: searchDate,
        modes,
    }
}

router.post<'/replace-leg/:id', { id: string }>(
    '/replace-leg/:id',
    async (req, res, next) => {
        try {
            const { id } = req.params
            const { numberOfNext, numberOfPrevious } = req.body
            const { leg } = await getAlternativeLegs(
                id,
                numberOfNext,
                numberOfPrevious,
            )

            res.json(leg)
        } catch (error) {
            next(error)
        }
    },
)

function getExpectedStartTime(newLegs: Leg[]): string {
    let expectedStartTime = ''

    if (newLegs[0]?.id === null && newLegs[1]?.expectedStartTime) {
        expectedStartTime = toISOString(
            subSeconds(
                parseISO(newLegs[1].expectedStartTime),
                newLegs[0].duration,
            ),
            { timeZone: 'Europe/Oslo' },
        )
    } else {
        expectedStartTime = newLegs[0]?.expectedStartTime || ''
    }
    return expectedStartTime
}

function getExpectedEndTime(newLegs: Leg[]): string {
    let expectedEndTime = ''
    if (
        newLegs.length > 1 &&
        newLegs[newLegs.length - 1]?.id === null &&
        newLegs[newLegs.length - 2]?.expectedEndTime
    ) {
        const lastTransitExpectedEnd =
            newLegs[newLegs.length - 2]?.expectedEndTime || ''
        const lastFootLegDuration = newLegs[newLegs.length - 1]?.duration || 0

        expectedEndTime = toISOString(
            addSeconds(parseISO(lastTransitExpectedEnd), lastFootLegDuration),
            { timeZone: 'Europe/Oslo' },
        )
    } else {
        expectedEndTime = newLegs[newLegs.length - 1]?.expectedEndTime || ''
    }

    return expectedEndTime
}

router.post<'/replace-trip-pattern', { id: string }>(
    '/replace-trip-pattern',
    async (req, res, next) => {
        try {
            const { newLegId, originalLegId, originalTripPatternId } = req.body

            const newLeg = await getLeg(newLegId)

            const originalTripPattern = await cacheGet<TripPattern>(
                `trip-pattern:${originalTripPatternId}`,
            )

            if (originalTripPattern) {
                const newLegs = originalTripPattern.legs.map((leg) => {
                    if (!leg.id) return leg
                    if (leg.id === originalLegId) return newLeg
                    return leg
                })

                // If first Leg is foot we have to do some manual modification to the Tripattern
                const expectedStartTime = getExpectedStartTime(newLegs)
                // If last Leg is foot we have to do some manual modification to the Tripattern
                const expectedEndTime = getExpectedEndTime(newLegs)

                let duration = 0
                if (expectedStartTime && expectedEndTime) {
                    duration = differenceInSeconds(
                        new Date(expectedStartTime),
                        new Date(expectedEndTime),
                    )
                }

                const newId = uuid()
                const newTripPattern = {
                    ...originalTripPattern,
                    expectedStartTime,
                    expectedEndTime,
                    duration,
                    legs: newLegs,
                    id: newId,
                }

                await cacheSet(`trip-pattern:${newId}`, newTripPattern)

                res.json(newTripPattern)
            }
        } catch (error) {
            next(error)
        }
    },
)

// DEPRECATED - MAY 2022
// Deprecated endpoint against OTP1 - Will be removed September 2022
router.post<
    '/:id/replace-leg',
    { id: string },
    { tripPatterns: TripPattern[] },
    { replaceLegServiceJourneyId: string }
>('/:id/replace-leg', async (req, res, next) => {
    try {
        const { id } = req.params
        const { replaceLegServiceJourneyId } = req.body

        let stopTrace = trace('retrieve from cache')
        const [tripPattern, searchParams] = await Promise.all([
            cacheGet<TripPatternParsed>(`trip-pattern:${id}`),
            cacheGet<SearchParams>(
                `search-params:${deriveSearchParamsId(id)}`,
                SEARCH_PARAMS_EXPIRE_IN_SECONDS,
            ),
        ])
        stopTrace()

        if (!tripPattern) {
            if (searchParams) {
                throw new TripPatternExpiredError(
                    `Found no trip pattern with id ${id} but search params are still present`,
                    searchParams,
                )
            }
            throw new NotFoundError(
                `Found no trip pattern with id ${id}. Maybe cache entry expired?`,
            )
        }

        // This should not happen as the trip pattern cache lives shorter than the
        // searchParams cache.
        if (!searchParams) {
            throw new NotFoundError(
                `Found no search params id ${id}. Maybe cache entry expired?`,
            )
        }

        stopTrace = trace('getAlternativeTripPatterns')
        const params = getParams(searchParams)
        const tripPatterns = await getAlternativeTripPatterns(
            tripPattern,
            replaceLegServiceJourneyId,
            params,
        )
        stopTrace()

        stopTrace = trace('populating cache')
        const searchParamsIds = uniq(
            tripPatterns.map(({ id: tripPatternId = '' }) =>
                deriveSearchParamsId(tripPatternId),
            ),
        )
        await Promise.all([
            ...tripPatterns.map((trip) =>
                cacheSet(`trip-pattern:${trip.id}`, trip),
            ),
            ...searchParamsIds.map((searchParamsId) =>
                cacheSet(
                    `search-params:${searchParamsId}`,
                    params,
                    SEARCH_PARAMS_EXPIRE_IN_SECONDS,
                ),
            ),
        ])
        stopTrace()

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
})

export default router
