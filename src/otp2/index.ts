import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'

import { RawSearchParams, SearchParams, GraphqlQuery } from '../../types'

import { searchTransit, searchNonTransit, searchBikeRental } from './controller'

import { parseCursor, generateCursor } from './cursor'
import { filterModesAndSubModes } from '../utils/modes'
import { buildShamashLink } from '../utils/graphql'
import { clean } from '../utils/object'

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
        process.env.ENVIRONMENT === 'prod'
            ? 'https://api.entur.io/graphql-explorer/journey-planner-v3'
            : `https://api.${process.env.ENVIRONMENT}.entur.io/graphql-explorer/journey-planner-v3`

    return buildShamashLink(host, query, variables)
}

function getParams(params: RawSearchParams): SearchParams {
    const searchDate = params.searchDate ? parseJSON(params.searchDate) : new Date()
    const { filteredModes, subModesFilter, banned, whiteListed } = filterModesAndSubModes(params.searchFilter)

    return {
        ...params,
        searchDate,
        initialSearchDate: searchDate,
        modes: filteredModes,
        transportSubmodes: subModesFilter,
        banned,
        whiteListed,
    }
}

router.post('/v1/transit', async (req, res, next) => {
    try {
        const cursorData = parseCursor(req.body?.cursor)
        const params = cursorData?.params || getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const { tripPatterns, hasFlexibleTripPattern, queries, metadata } = await searchTransit(params, extraHeaders)

        const queriesWithLinks =
            process.env.ENVIRONMENT === 'prod'
                ? undefined
                : queries.map((query) => ({
                      ...query,
                      shamash: generateShamashLink(query),
                  }))

        const nextCursor = generateCursor(params, metadata, tripPatterns)

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            nextCursor,
            queries: queriesWithLinks,
        })
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

router.post('/v1/bike-rental', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const tripPattern = await searchBikeRental(params, extraHeaders)

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
})

export default router
