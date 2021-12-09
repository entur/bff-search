import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'

import trace from '../../tracer'
import { set as cacheSet } from '../../cache'
import logger from '../../logger'

import { RawSearchParams, SearchParams, GraphqlQuery } from '../../types'

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
import { GetTripPatternError, RoutingErrorsError } from '../../errors'

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

function mapQueries(
    queries: GraphqlQuery[],
    useOtp2: boolean,
):
    | (GraphqlQuery & { algorithm: 'OTP1' | 'OTP2'; shamash: string })[]
    | undefined {
    if (ENVIRONMENT === 'prod') return

    return queries.map((q) => ({
        ...q,
        algorithm: useOtp2 ? 'OTP2' : 'OTP1',
        shamash: useOtp2 ? generateShamashLinkOtp2(q) : generateShamashLink(q),
    }))
}

router.post('/', async (req, res, next) => {
    let useOtp2 = false

    try {
        let stopTrace = trace('parseCursor')
        const cursorData = parseCursor(req.body?.cursor)
        stopTrace()

        const params = cursorData?.params || getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const clientName = extraHeaders['ET-Client-Name'] || 'Unknown client'

        if (cursorData) {
            // Restrict flex results only to the initial search
            params.useFlex = false
        }

        let searchMethod = cursorData ? searchTransit : searchTransitWithTaxi

        useOtp2 = !res.locals.forceOtp1

        if (useOtp2) {
            // @ts-ignore searchTransitOtp2 expects a slightly different SearchParams type
            searchMethod = searchTransitOtp2
        }

        logger.info(`Using OTP2 ${useOtp2}`, {
            useOtp2,
        })

        stopTrace = trace(
            cursorData ? 'searchTransit' : 'searchTransitWithTaxi',
        )
        const { tripPatterns, metadata, hasFlexibleTripPattern, queries } =
            await searchMethod(params, extraHeaders)
        stopTrace()

        if (!cursorData) {
            const stopLogTransitAnalyticsTrace = trace('logTransitAnalytics')
            logTransitAnalytics(params, useOtp2, clientName)
                .then(stopLogTransitAnalyticsTrace)
                .catch((error) => {
                    logger.error('Failed to log transit analytics', {
                        error: error.message,
                        stack: error.stack,
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
        const mappedQueries = mapQueries(queries, useOtp2)
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
            .catch((error) => logger.error(error))
            .finally(stopCacheTrace)

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            isSameDaySearch: true, // TODO 2020-03-09: Deprecated! For compatibility with v5.2.0 and older app versions we need to keep returning isSameDaySearch for a while. See https://bitbucket.org/enturas/entur-clients/pull-requests/4167
            nextCursor,
            queries: mappedQueries,
        })
    } catch (error) {
        if (error instanceof RoutingErrorsError) {
            return res.json({
                tripPatterns: [],
                hasFlexibleTripPattern: false,
                queries: mapQueries(error.getQueries(), useOtp2),
                routingErrors: error.getRoutingErrors(),
            })
        } else if (error instanceof GetTripPatternError) {
            return res.status(500).json({
                tripPatterns: [],
                queries: mapQueries([error.getQuery()], useOtp2),
            })
        }
        next(error)
    }
})

export default router
