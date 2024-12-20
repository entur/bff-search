import { Router } from 'express'
import { parseJSON } from 'date-fns'

import {
    GraphqlQuery,
    RawSearchParams,
    RoutingError,
    SearchParams,
    TripPatternParsed,
} from '../../types'
import { generateShamashLink, searchFlexibleTransit } from '../../logic/otp2'
import { filterCoordinates } from '../../utils/searchParams'
import { filterModesAndSubModes } from '../../logic/otp2/modes'

import { ENVIRONMENT } from '../../config'

import { getHeadersFromClient } from './helper'

const router = Router()

function mapQueries(
    queries: GraphqlQuery[],
): (GraphqlQuery & { shamash: string })[] | undefined {
    if (ENVIRONMENT === 'prod') return

    return queries.map((q) => ({
        ...q,
        shamash: generateShamashLink(q),
    }))
}

export interface PostFlexibleTransitResponse {
    tripPatterns: TripPatternParsed[]
    queries?: (GraphqlQuery & { shamash: string })[]
    routingErrors?: RoutingError[]
}

function getFlexibleTransitParams(params: RawSearchParams): SearchParams {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()
    const modes = filterModesAndSubModes(params.searchFilter, true)

    return {
        ...params,
        from: filterCoordinates(params.from),
        to: filterCoordinates(params.to),
        searchDate,
        modes,
    }
}

export type PostFlexibleTransitRequestBody = RawSearchParams

router.post<
    '/',
    Record<string, never>,
    PostFlexibleTransitResponse,
    PostFlexibleTransitRequestBody
>('/', async (req, res, next) => {
    try {
        const params = getFlexibleTransitParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const { tripPatterns, queries } = await searchFlexibleTransit(
            params,
            extraHeaders,
        )

        const mappedQueries = mapQueries(queries)

        res.json({
            tripPatterns,
            queries: mappedQueries,
        })
    } catch (error) {
        next(error)
    }
})

export default router
