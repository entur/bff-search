import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'

import { TripPattern } from '@entur/sdk'

import { uniq } from '../utils/array'
import { deriveSearchParamsId } from '../utils/searchParams'
import { set as cacheSet, get as cacheGet } from '../cache'
import { NotFoundError } from '../errors'
import { RawSearchParams, GraphqlQuery, SearchParams } from '../types'

import {
    searchTransit,
    searchNonTransit,
    NonTransitMode,
    searchFlexible,
} from './controller'
import { updateTripPattern, getExpires } from './updateTrip'

import { parseCursor, generateCursor } from './cursor'
import { buildShamashLink } from '../utils/graphql'
import { clean } from '../utils/object'

import logger from '../logger'
import { ENVIRONMENT } from '../config'

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

export function generateShamashLink({
    query,
    variables,
}: GraphqlQuery): string {
    const host =
        ENVIRONMENT === 'prod'
            ? 'https://api.entur.io/graphql-explorer/journey-planner-v3'
            : `https://api.${ENVIRONMENT}.entur.io/graphql-explorer/journey-planner-v3-beta`

    return buildShamashLink(host, query, variables)
}

function getParams(params: RawSearchParams): SearchParams {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()

    return {
        ...params,
        searchDate,
        initialSearchDate: searchDate,
    }
}

function isNotUndefined<T>(thing: T | undefined): thing is T {
    return thing !== undefined
}

router.post('/v1/transit', async (req, res, next) => {
    try {
        const cursorData = parseCursor(req.body?.cursor)
        const params = cursorData?.params || getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const correlationId = req.get('X-Correlation-Id')

        const [
            flexibleTripPattern,
            { tripPatterns, hasFlexibleTripPattern, queries, metadata },
        ] = await Promise.all([
            req.body.cursor ? undefined : searchFlexible(params),
            searchTransit(params, extraHeaders),
        ])

        const queriesWithLinks =
            ENVIRONMENT === 'prod'
                ? undefined
                : queries.map((query) => ({
                      ...query,
                      algorithm: 'OTP2',
                      shamash: generateShamashLink(query),
                  }))

        const nextCursor = generateCursor(params, metadata)

        const allTripPatterns = [flexibleTripPattern, ...tripPatterns].filter(
            isNotUndefined,
        )

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
        ]).catch((error) => logger.error(error, { correlationId }))

        res.json({
            tripPatterns: allTripPatterns,
            hasFlexibleTripPattern,
            nextCursor,
            queries: queriesWithLinks,
        })
    } catch (error) {
        next(error)
    }
})

router.get('/v1/trip-patterns/:id', async (req, res, next) => {
    try {
        const { id } = req.params
        const { update } = req.query

        const tripPattern = await cacheGet<TripPattern>(`trip-pattern:${id}`)

        if (!tripPattern) {
            throw new NotFoundError(
                `Found no trip pattern with id ${id}. Maybe cache entry expired?`,
            )
        }

        if (update) {
            const updatedTripPattern = await updateTripPattern(tripPattern)
            const expires = getExpires(updatedTripPattern)
            res.json({ tripPattern: updatedTripPattern, expires })
        } else {
            res.json({ tripPattern })
        }
    } catch (error) {
        next(error)
    }
})

router.post('/v1/non-transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const { tripPatterns, queries } = await searchNonTransit(params)

        let queriesWithLinks = undefined

        if (ENVIRONMENT !== 'prod') {
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
