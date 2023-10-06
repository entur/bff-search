import { Request, Router } from 'express'
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
    generateCursor,
    generateShamashLink,
    parseCursor,
    searchTransit,
} from '../../logic/otp2'

import { uniq } from '../../utils/array'
import { clean } from '../../utils/object'
import {
    deriveSearchParamsId,
    filterCoordinates,
} from '../../utils/searchParams'
import { filterModesAndSubModes } from '../../logic/otp2/modes'

import {
    ENVIRONMENT,
    REPLACE_MY_LOCATION_WITH_NEAREST_STOP,
} from '../../config'
import { GetTripPatternError, RoutingErrorsError } from '../../errors'
import {
    getNearestStopPlace,
    isMyLocation,
} from '../../logic/stopPlaceMatching'

const SEARCH_PARAMS_EXPIRE_IN_SECONDS = 2 * 60 * 60 // two hours

const router = Router()

interface ExtraHeaders {
    [key: string]: string
}

function getHeadersFromClient(req: Request): ExtraHeaders {
    return clean({
        'X-Correlation-Id': req.get('X-Correlation-Id'),
        'ET-Client-Name': 'entur-search',
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
    nextCursor?: string | null
    queries?: (GraphqlQuery & { shamash: string })[]
    routingErrors?: RoutingError[]
}

// export type PostTransitRequestBody = RawSearchParams & {
//     cursor?: string
// }

router.post<'/', Record<string, never>, PostTransitResponse, RawSearchParams>(
    '/',
    async (req, res, next) => {
        try {
            console.log('TRANSIT CALL')
            // console.log(nextCursor)
            let stopTrace = trace('parseCursor')

            const cursorData = parseCursor(req.body?.cursor)
            stopTrace()
            // console.log('req.body ', req.body)
            // const params = getParams(req.body)
            const params = cursorData?.params || getParams(req.body)

            const isApp = req.header('et-client-platform') === 'APP'
            if (
                isApp &&
                REPLACE_MY_LOCATION_WITH_NEAREST_STOP === 'true' &&
                isMyLocation(params)
            ) {
                const lon = params.from.coordinates?.longitude
                const lat = params.from.coordinates?.latitude

                const nearestStopPlace = await getNearestStopPlace(lon, lat)

                if (nearestStopPlace) {
                    logger.debug(
                        `Searched from my location and found ${nearestStopPlace.place}`,
                        {
                            originalFrom: params.from,
                            nearestStopPlace,
                        },
                    )
                    params.from = nearestStopPlace
                } else {
                    logger.debug(
                        `Searched from my location but found nothing but boogers`,
                        {
                            originalFrom: params.from,
                        },
                    )
                }
            } else {
                //  logger.info('Replacement disabled')
            }

            const extraHeaders = getHeadersFromClient(req)

            // stopTrace = trace(
            //     cursorData ? 'searchTransit' : 'searchTransitWithTaxi',
            // )

            console.log('Cursor som brukes i nytt søk ', params.pageCursor)
            const {
                tripPatterns,
                queries,
                previousPageCursor,
                nextPageCursor,
            } = await searchTransit(params, extraHeaders)
            stopTrace()

            stopTrace = trace('generateCursor')
            const otpCursor = params.arriveBy
                ? previousPageCursor
                : nextPageCursor

            const generatedCursor = generateCursor(params, otpCursor)
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
                nextCursor: generatedCursor,
                queries: mappedQueries,
            })
        } catch (error) {
            console.log(error)
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
    },
)

export default router
