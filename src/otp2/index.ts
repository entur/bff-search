import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'
import { v4 as uuid } from 'uuid'

import { set as cacheSet } from '../cache'
import { RawSearchParams, SearchParams, GraphqlQuery } from '../../types'

import { searchTransit, searchNonTransit, NonTransitMode } from './controller'

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

        const tripPatternsWithId = tripPatterns.map((tripPattern) => ({
            ...tripPattern,
            id: tripPattern.id || uuid(),
        }))

        tripPatternsWithId.forEach((tripPattern) => {
            cacheSet(`trip-pattern:${tripPattern.id}`, tripPattern)
        })

        res.json({
            tripPatterns: tripPatternsWithId,
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
        const { tripPatterns, queries } = await searchNonTransit(params)

        let queriesWithLinks = undefined

        if (process.env.ENVIRONMENT !== 'prod') {
            const modes = Object.keys(queries) as NonTransitMode[]
            queriesWithLinks = modes.reduce((acc, mode) => {
                const q = queries[mode]
                if (!q) return acc
                const shamash = generateShamashLink(q)
                return {
                    ...acc,
                    [mode]: {
                        // ...q,
                        shamash,
                    },
                }
            }, {})
        }

        res.json({ tripPatterns, queries: queriesWithLinks })
    } catch (error) {
        next(error)
    }
})

// TODO 2020-04-02: Deprecated. Bike rental alternatives are now fetched through the non-transit endpoint
// Only reason to keep this for OTP2 is to prevent 404s in test clients.
router.post('/v1/bike-rental', async (_req, res, next) => {
    try {
        res.json({})
    } catch (error) {
        next(error)
    }
})

export default router
