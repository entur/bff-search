import { Router } from 'express'
import { differenceInSeconds, subSeconds, parseISO, addSeconds } from 'date-fns'
import { toISOString } from '../../utils/time'

import { v4 as uuid } from 'uuid'

import { set as cacheSet, get as cacheGet } from '../../cache'
import {
    NotFoundError,
    InvalidArgumentError,
    TripPatternExpiredError,
} from '../../errors'
import { verifyPartnerToken } from '../../auth'

import { SearchParams, TripPattern, TripPatternParsed, Leg } from '../../types'

import {
    updateTripPattern,
    getExpires,
    getAlternativeLegs,
    getLeg,
} from '../../logic/otp2'

import { deriveSearchParamsId } from '../../utils/searchParams'

import { getHeadersFromClient } from './helper'

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

router.post<'/replace-leg/:id', { id: string }>(
    '/replace-leg/:id',
    async (req, res, next) => {
        try {
            const { id } = req.params
            const extraHeaders = getHeadersFromClient(req)

            const { numberOfNext, numberOfPrevious } = req.body
            const variables = {
                id,
                numberOfNext,
                numberOfPrevious,
            }
            const { leg } = await getAlternativeLegs(variables, extraHeaders)

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
            const extraHeaders = getHeadersFromClient(req)

            const newLeg = await getLeg(newLegId, extraHeaders)

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

export default router
