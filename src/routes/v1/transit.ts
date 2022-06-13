import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'

import trace from '../../tracer'
import { set as cacheSet } from '../../cache'
import logger from '../../logger'

import {
    RawSearchParams,
    SearchParams,
    GraphqlQuery,
    RoutingError,
    TripPatternParsed,
} from '../../types'

import {
    generateShamashLink,
    searchTransit,
    parseCursor,
    generateCursor,
} from '../../logic/otp2'

import { uniq } from '../../utils/array'
import { clean } from '../../utils/object'
import {
    deriveSearchParamsId,
    filterCoordinates,
} from '../../utils/searchParams'
import { filterModesAndSubModes } from '../../logic/otp2/modes'

import { ENVIRONMENT } from '../../config'
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
        'ET-Client-Version': req.get('ET-Client-Version'),
        'ET-Client-Platform': req.get('ET-Client-Platform'),
    })
}

function getParams(params: RawSearchParams): SearchParams {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()
    const modes = filterModesAndSubModes(params.searchFilter)

    return {
        ...params,
        from: filterCoordinates(params.from),
        to: filterCoordinates(params.to),
        searchDate,
        initialSearchDate: searchDate,
        modes,
    }
}

function mapQueries(
    queries: GraphqlQuery[],
): (GraphqlQuery & { shamash: string })[] | undefined {
    if (ENVIRONMENT === 'prod') return

    return queries.map((q) => ({
        ...q,
        shamash: generateShamashLink(q),
    }))
}

export interface PostTransitResponse {
    tripPatterns: TripPatternParsed[]
    hasFlexibleTripPattern?: boolean
    nextCursor?: string
    queries?: (GraphqlQuery & { shamash: string })[]
    routingErrors?: RoutingError[]
}

export type PostTransitRequestBody = RawSearchParams & {
    cursor?: string
}

router.post<
    '/',
    Record<string, never>,
    PostTransitResponse,
    PostTransitRequestBody
>('/', async (req, res, next) => {
    try {
        let stopTrace = trace('parseCursor')
        const cursorData = parseCursor(req.body?.cursor)
        stopTrace()

        const params = cursorData?.params || getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)

        stopTrace = trace(
            cursorData ? 'searchTransit' : 'searchTransitWithTaxi',
        )

        const {
            tripPatterns,
            metadata,
            // OTP2 does not return hasFlexibleTripPattern, but we still have
            // to return it because old versions of the app require it for logging
            // @ts-ignore
            hasFlexibleTripPattern = false,
            queries,
        } = await searchTransit(params, extraHeaders)
        stopTrace()

        stopTrace = trace('generateCursor')
        const nextCursor = generateCursor(params, metadata)
        stopTrace()

        stopTrace = trace('generateShamashLinks')
        const mappedQueries = mapQueries(queries)
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
            nextCursor,
            queries: mappedQueries,
        })
    } catch (error) {
        if (error instanceof RoutingErrorsError) {
            return res.json({
                tripPatterns: [],
                hasFlexibleTripPattern: false,
                queries: mapQueries(error.getQueries()),
                routingErrors: error.getRoutingErrors(),
            })
        } else if (error instanceof GetTripPatternError) {
            logger.error(error.message, error)
            return res.status(500).json({
                tripPatterns: [],
                queries: mapQueries([error.getQuery()]),
            })
        }
        next(error)
    }
})

export default router
