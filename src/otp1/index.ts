import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'
import { v4 as uuid } from 'uuid'
import distance from 'haversine-distance'
import { FeatureCollection, Polygon } from 'geojson'
import booleanContains from '@turf/boolean-contains'
import { point } from '@turf/helpers'

import { TripPattern } from '@entur/sdk'

import trace from '../tracer'
import { set as cacheSet, get as cacheGet } from '../cache'
import { NotFoundError, InvalidArgumentError } from '../errors'
import { verifyPartnerToken } from '../auth'

import {
    RawSearchParams,
    SearchParams,
    GraphqlQuery,
    SearchFilter,
} from '../types'

import { generateShamashLink as generateShamashLinkOtp2 } from '../otp2'
import { searchTransit as searchTransitOtp2 } from '../otp2/controller'
import { generateCursor as generateCursorOtp2 } from '../otp2/cursor'
import {
    searchTransitWithTaxi,
    searchTransit,
    searchNonTransit,
} from './controller'
import { updateTripPattern, getExpires } from './updateTrip'

import logger from '../logger'
import { filterModesAndSubModes } from '../utils/modes'
import { uniq } from '../utils/array'
import { deriveSearchParamsId } from '../utils/searchParams'
import { buildShamashLink } from '../utils/graphql'
import { clean } from '../utils/object'

import { ENVIRONMENT } from '../config'
import { logTransitAnalytics, logTransitResultStats } from '../bigquery'

import { parseCursor, generateCursor } from './cursor'
import { getAlternativeTripPatterns } from './replaceLeg'

let otp2Areas: FeatureCollection<Polygon> | undefined

import(ENVIRONMENT === 'prod' ? './otp2Areas.prod' : './otp2Areas.staging')
    .then(({ default: geojson }) => {
        otp2Areas = geojson
    })
    .catch((error) =>
        logger.error('Failed to import otp2Areas', {
            message: error.message,
            stack: error.stack,
        }),
    )

const SEARCH_PARAMS_EXPIRE_IN_SECONDS = 2 * 60 * 60 // two hours

const router = Router()

interface ExtraHeaders {
    [key: string]: string
}

function getHeadersFromClient(req: Request): ExtraHeaders {
    const clientName = req.get('ET-Client-Name')

    return clean({
        'X-Correlation-Id': req.get('X-Correlation-Id'),
        'ET-Client-Name': clientName ? `${clientName}-bff` : 'entur-search',
    })
}

function generateShamashLink({ query, variables }: GraphqlQuery): string {
    const host =
        ENVIRONMENT === 'prod'
            ? 'https://api.entur.io/journey-planner/v2/ide/'
            : `https://api.${ENVIRONMENT}.entur.io/journey-planner/v2/ide/`

    return buildShamashLink(host, query, variables)
}

function getParams(params: RawSearchParams): SearchParams {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()
    const {
        filteredModes,
        subModesFilter,
        banned,
        whiteListed,
    } = filterModesAndSubModes(params.searchFilter)

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

/*
 * OTP 2 Distance Scenario
 * Use OTP 2 if distance between from and to > 50 km
 * and Air and Rail filters are turned off
 */
function searchQualifiesForDistanceScenario(params: SearchParams): boolean {
    const { from, to } = params
    if (!from.coordinates || !to.coordinates) return false

    const blacklistedFilters = [SearchFilter.AIR, SearchFilter.RAIL]

    if (
        blacklistedFilters.some((filter) =>
            params.searchFilter?.includes(filter),
        )
    ) {
        return false
    }

    const distanceBetweenFromAndTo = distance(from.coordinates, to.coordinates)
    const distanceLimit = 50000
    return distanceBetweenFromAndTo >= distanceLimit
}

/*
 * OTP 2 Area Scenario
 * Use OTP 2 if both from and to are within any polygon in the GeoJSON feature collection
 * and air filter is disabled
 */
function searchQualifiesForAreaScenario(params: SearchParams): boolean {
    const { from, to } = params

    if (
        !from.coordinates ||
        !to.coordinates ||
        !otp2Areas?.features ||
        params.searchFilter?.includes(SearchFilter.AIR)
    ) {
        return false
    }

    const fromPoint = point([
        from.coordinates.longitude,
        from.coordinates.latitude,
    ])
    const toPoint = point([to.coordinates.longitude, to.coordinates.latitude])

    return otp2Areas.features.some(
        (polygonFeature) =>
            booleanContains(polygonFeature, fromPoint) &&
            booleanContains(polygonFeature, toPoint),
    )
}

function shouldUseOtp2(params: SearchParams): boolean {
    return (
        searchQualifiesForDistanceScenario(params) ||
        searchQualifiesForAreaScenario(params)
    )
}

router.post('/v1/transit', async (req, res, next) => {
    try {
        let stopTrace = trace('parseCursor')
        const cursorData = parseCursor(req.body?.cursor)
        stopTrace()

        const params = cursorData?.params || getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const clientName = extraHeaders['ET-Client-Name']

        if (cursorData) {
            // Restrict flex results only to the initial search
            params.useFlex = false
        }

        let searchMethod = cursorData ? searchTransit : searchTransitWithTaxi
        const useOtp2 = !res.locals.forceOtp1 && shouldUseOtp2(params)
        if (useOtp2) {
            searchMethod = searchTransitOtp2
        }

        const correlationId = req.get('X-Correlation-Id')

        logger.info(`Using OTP2 ${useOtp2}`, {
            useOtp2,
            correlationId,
        })

        stopTrace = trace(
            cursorData ? 'searchTransit' : 'searchTransitWithTaxi',
        )
        const {
            tripPatterns,
            metadata,
            hasFlexibleTripPattern,
            queries,
        } = await searchMethod(params, extraHeaders)
        stopTrace()

        if (!cursorData) {
            const stopLogTransitAnalyticsTrace = trace('logTransitAnalytics')
            logTransitAnalytics(params, useOtp2, clientName)
                .then(stopLogTransitAnalyticsTrace)
                .catch((error) => {
                    logger.error('Failed to log transit analytics', {
                        error: error.message,
                        stack: error.stack,
                        correlationId,
                    })
                })

            const numberOfDistinctOperators = uniq(
                tripPatterns
                    .flatMap(({ legs }) => legs)
                    .map(({ operator }) => operator?.id)
                    .filter(Boolean),
            ).length

            logTransitResultStats(numberOfDistinctOperators, clientName).catch(
                (error) => {
                    logger.error('Failed to log transit result stats', {
                        error: error.message,
                        stack: error.stack,
                        correlationId,
                    })
                },
            )
        }

        stopTrace = trace('generateCursor')
        const nextCursor = useOtp2
            ? generateCursorOtp2(params, metadata)
            : generateCursor(params, tripPatterns)
        stopTrace()

        stopTrace = trace('generateShamashLinks')
        const mappedQueries =
            ENVIRONMENT === 'prod'
                ? undefined
                : queries.map((q) => ({
                      ...q,
                      algorithm: useOtp2 ? 'OTP2' : 'OTP1',
                      shamash: useOtp2
                          ? generateShamashLinkOtp2(q)
                          : generateShamashLink(q),
                  }))
        stopTrace()

        const stopCacheTrace = trace('cache')
        const searchParamsIds = uniq(
            tripPatterns.map(({ id = '' }) => deriveSearchParamsId(id)),
        )

        Promise.all([
            ...tripPatterns.map((tripPattern) =>
                cacheSet(`trip-pattern:${tripPattern.id}`, tripPattern),
            ),
            ...searchParamsIds.map((searchParamsId) =>
                cacheSet(
                    `search-params:${searchParamsId}`,
                    params,
                    SEARCH_PARAMS_EXPIRE_IN_SECONDS,
                ),
            ),
        ])
            .catch((error) => logger.error(error, { correlationId }))
            .finally(stopCacheTrace)

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            isSameDaySearch: true, // TODO 2020-03-09: Deprecated! For compatibility with v5.2.0 and older app versions we need to keep returning isSameDaySearch for a while. See https://bitbucket.org/enturas/entur-clients/pull-requests/4167
            nextCursor,
            queries: mappedQueries,
        })
    } catch (error) {
        next(error)
    }
})

router.get('/v1/trip-patterns/:id', async (req, res, next) => {
    try {
        const { id } = req.params
        const { update } = req.query

        const [tripPattern, searchParams] = await Promise.all([
            cacheGet<TripPattern>(`trip-pattern:${id}`),
            cacheGet<SearchParams>(`search-params:${deriveSearchParamsId(id)}`),
        ])

        if (!tripPattern) {
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

router.post('/v1/trip-patterns', verifyPartnerToken, async (req, res, next) => {
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

router.post('/v1/trip-patterns/:id/replace-leg', async (req, res, next) => {
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
            throw new NotFoundError(
                `Found no trip pattern with id ${id}. Maybe cache entry expired?`,
            )
        }
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

router.post('/v1/non-transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)

        const tripPatterns = await searchNonTransit(params, extraHeaders)

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
})

// TODO 2020-04-02: Deprecated. Bike rental alternatives are now fetched through the non-transit endpoint
router.post('/v1/bike-rental', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const tripPattern = await searchNonTransit(params, extraHeaders, [
            'bicycle_rent',
        ])

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
})

export default router
