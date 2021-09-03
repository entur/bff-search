import { Router, Request } from 'express'
import { FeatureCollection, Polygon } from 'geojson'
import distance from 'haversine-distance'
import booleanContains from '@turf/boolean-contains'
import { point } from '@turf/helpers'
import { parseJSON } from 'date-fns'

import trace from '../../tracer'
import { set as cacheSet } from '../../cache'
import logger from '../../logger'

import { RawSearchParams, SearchParams, SearchFilter } from '../../types'

import {
    searchTransitWithTaxi,
    searchTransit,
    parseCursor,
    generateShamashLink,
    generateCursor,
} from '../../logic/otp1'

import {
    generateShamashLink as generateShamashLinkOtp2,
    searchTransit as searchTransitOtp2,
    generateCursor as generateCursorOtp2,
} from '../../logic/otp2'

import { uniq } from '../../utils/array'
import { clean } from '../../utils/object'
import { deriveSearchParamsId } from '../../utils/searchParams'
import { filterModesAndSubModes } from '../../utils/modes'

import { ENVIRONMENT } from '../../config'
import { logTransitAnalytics, logTransitResultStats } from '../../bigquery'

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

router.post('/', async (req, res, next) => {
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
        const searchOptions: { runOnce?: boolean; enableTaxiSearch?: boolean } =
            {
                enableTaxiSearch:
                    ENVIRONMENT !== 'prod' && res.locals.forceOtp2 === true,
            }

        const useOtp2 =
            res.locals.forceOtp2 ||
            (!res.locals.forceOtp1 && shouldUseOtp2(params))
        if (useOtp2) {
            // @ts-ignore searchTransitOtp2 expects a slightly different SearchParams type
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
        const { tripPatterns, metadata, hasFlexibleTripPattern, queries } =
            await searchMethod(params, extraHeaders, undefined, searchOptions)
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

export default router
