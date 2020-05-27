import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'
import { v4 as uuid } from 'uuid'

import { TripPattern } from '@entur/sdk'

import trace from '../tracer'
import { set as cacheSet, get as cacheGet } from '../cache'
import { NotFoundError, InvalidArgumentError } from '../errors'
import { verifyPartnerToken } from '../auth'

import { RawSearchParams, SearchParams, GraphqlQuery } from '../../types'

import { searchTransitWithTaxi, searchTransit, searchNonTransit } from './controller'
import { updateTripPattern, getExpires } from './updateTrip'

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
        useFlex: true,
    }
}

router.post('/v1/transit', async (req, res, next) => {
    try {
        let stopTrace = trace('parseCursor')
        const cursorData = parseCursor(req.body?.cursor)
        stopTrace()

        const params = cursorData?.params || getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)

        if (cursorData) {
            // Restrict flex results only to the initial search
            params.useFlex = false
        }

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

        stopTrace = trace('cache')
        await Promise.all(tripPatterns.map((tripPattern) => cacheSet(`trip-pattern:${tripPattern.id}`, tripPattern)))
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

router.get('/v1/trip-patterns/:id', async (req, res, next) => {
    try {
        const { id } = req.params
        const { update } = req.query

        const tripPattern = await cacheGet<TripPattern>(`trip-pattern:${id}`)

        if (!tripPattern) {
            throw new NotFoundError(`Found no trip pattern with id ${id}. Maybe cache entry expired?`)
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

router.post('/v1/trip-patterns', verifyPartnerToken, async (req, res, next) => {
    try {
        const { tripPattern } = req.body

        if (!tripPattern) {
            throw new InvalidArgumentError('Found no `tripPattern` key in body.')
        }

        if (typeof tripPattern !== 'object') {
            throw new InvalidArgumentError(`\`tripPattern\` is invalid. Expected an object, got ${typeof tripPattern}`)
        }

        const id = tripPattern.id || uuid()

        const newTripPattern = {
            ...tripPattern,
            id,
        }

        await cacheSet(`trip-pattern:${id}`, newTripPattern)

        res.status(201).json({ tripPattern: newTripPattern })
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
