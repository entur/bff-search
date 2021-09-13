import { Router } from 'express'
import { parseJSON } from 'date-fns'
import { v4 as uuid } from 'uuid'

import { TripPattern } from '@entur/sdk'

import trace from '../../tracer'
import { set as cacheSet, get as cacheGet } from '../../cache'
import {
    NotFoundError,
    InvalidArgumentError,
    TripPatternExpiredError,
} from '../../errors'
import { verifyPartnerToken } from '../../auth'

import { RawSearchParams, SearchParams } from '../../types'

import {
    updateTripPattern,
    getExpires,
    getAlternativeTripPatterns,
} from '../../logic/otp1'

import { filterModesAndSubModes } from '../../utils/modes'
import { uniq } from '../../utils/array'
import { deriveSearchParamsId } from '../../utils/searchParams'

const SEARCH_PARAMS_EXPIRE_IN_SECONDS = 2 * 60 * 60 // two hours

const router = Router()

router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params
        const { update } = req.query

        const [tripPattern, searchParams] = await Promise.all([
            cacheGet<TripPattern>(`trip-pattern:${id}`),
            cacheGet<SearchParams>(`search-params:${deriveSearchParamsId(id)}`),
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

router.post('/', verifyPartnerToken, async (req, res, next) => {
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
            cacheSet(`trip-pattern:${tripPatternId}`, newTripPattern, 10),
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
    const { filteredModes, subModesFilter, banned, whiteListed } =
        filterModesAndSubModes(params.searchFilter)

    return {
        ...params,
        searchDate,
        initialSearchDate: searchDate,
        modes: filteredModes,
        transportSubmodes: subModesFilter,
        banned,
        whiteListed,
        useFlex: true,
    }
}

router.post('/:id/replace-leg', async (req, res, next) => {
    try {
        const { id } = req.params
        const { replaceLegServiceJourneyId } = req.body

        let stopTrace = trace('retrieve from cache')
        const [tripPattern, searchParams] = await Promise.all([
            cacheGet<TripPattern>(`trip-pattern:${id}`),
            cacheGet<SearchParams>(`search-params:${deriveSearchParamsId(id)}`),
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
