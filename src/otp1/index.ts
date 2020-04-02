import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'

import trace from '../tracer'

import { RawSearchParams, SearchParams, GraphqlQuery } from '../../types'

import { searchTransitWithTaxi, searchTransit, searchNonTransit } from './controller'

import { parseCursor, generateCursor } from './cursor'
import { filterModesAndSubModes } from '../utils/modes'
import { buildShamashLink } from '../utils/graphql'
import { clean } from '../utils/object'

import { logTransitAnalytics } from '../bigquery'

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
            ? 'https://api.entur.io/journey-planner/v2/ide/'
            : `https://api.${process.env.ENVIRONMENT}.entur.io/journey-planner/v2/ide/`

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
        let stopTrace = trace('parseCursor')
        const cursorData = parseCursor(req.body?.cursor)
        stopTrace()

        const params = cursorData?.params || getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)

        stopTrace = trace(cursorData ? 'searchTransit' : 'searchTransitWithTaxi')
        const { tripPatterns, hasFlexibleTripPattern, isSameDaySearch, queries } = cursorData
            ? await searchTransit(params, extraHeaders)
            : await searchTransitWithTaxi(params, extraHeaders)
        stopTrace()

        stopTrace = trace('logTransitAnalytics')
        if (!cursorData) logTransitAnalytics(params, extraHeaders)
        stopTrace()

        stopTrace = trace('generateCursor')
        const nextCursor = generateCursor(params, tripPatterns)
        stopTrace()

        stopTrace = trace('generateShamashLinks')
        const mappedQueries =
            process.env.ENVIRONMENT === 'prod'
                ? undefined
                : queries.map((q) => ({
                      ...q,
                      shamash: generateShamashLink(q),
                  }))
        stopTrace()

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            isSameDaySearch,
            nextCursor,
            queries: mappedQueries,
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

// TODO 2020-04-02: Deprecated. Bike rental alternatives are now fetched through the non-transit endpoint
router.post('/v1/bike-rental', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const tripPattern = await searchNonTransit(params, extraHeaders, ['bicycle_rent'])

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
})

export default router
