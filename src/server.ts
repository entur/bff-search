if (process.env.NODE_ENV === 'production') {
    import('@google-cloud/trace-agent').then(trace => trace.start())
}

import bodyParser from 'body-parser'
import cors from 'cors'
import express, { Request } from 'express'
import { parseJSON } from 'date-fns'

import { RawSearchParams, SearchParams, GraphqlQuery } from '../types'

import {
    searchTransitWithTaxi,
    searchTransit,
    searchNonTransit,
    searchBikeRental,
} from './search'

import {
    searchTransit as searchTransitOtp2,
    searchNonTransit as searchNonTransitOtp2,
    searchBikeRental as searchBikeRentalOtp2,
} from './search-otp2'

import { parseCursor, generateCursor } from './utils/cursor'
import { filterModesAndSubModes } from './utils/modes'
import { clean } from './utils/object'

import { reqResLoggerMiddleware, errorLoggerMiddleware } from './logger'
import { logTransitAnalytics } from './bigquery'
import logger from './logger'

const PORT = process.env.PORT || 9000
const app = express()

app.use(cors())
app.use(bodyParser.json())
app.use(reqResLoggerMiddleware)

app.get('/_ah/warmup', (_req, res) => {
    res.end()
})

app.post('/v1/transit', async (req, res, next) => {
    try {
        const cursorData = parseCursor(req.body?.cursor)
        const params = cursorData?.params || getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)

        const { tripPatterns, hasFlexibleTripPattern, isSameDaySearch, queries } = cursorData
            ? await searchTransit(params, extraHeaders)
            : await searchTransitWithTaxi(params, extraHeaders)

        if (!cursorData) logTransitAnalytics(params, extraHeaders)

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            isSameDaySearch,
            nextCursor: generateCursor(params, tripPatterns),
            queries: process.env.ENVIRONMENT === 'prod'
                ? undefined
                : queries.map(q => ({
                    ...q,
                    shamash: generateShamashLink(q),
                })),
        })
    } catch (error) {
        next(error)
    }
})

app.post('/v1/non-transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)

        const tripPatterns = await searchNonTransit(params, extraHeaders)

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
})

app.post('/v1/bike-rental', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const tripPattern = await searchBikeRental(params, extraHeaders)

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
})

app.post('/otp2/v1/transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const { tripPatterns, hasFlexibleTripPattern, isSameDaySearch, queries } = await searchTransitOtp2(params, extraHeaders)

        const queriesWithLinks = process.env.ENVIRONMENT === 'prod'
            ? undefined
            : queries.map(q => ({
                ...q,
                shamash: generateShamashLink(q),
            }))

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            isSameDaySearch,
            queries: queriesWithLinks,
        })
    } catch (error) {
        next(error)
    }
})

app.post('/otp2/v1/non-transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const tripPatterns = await searchNonTransitOtp2(params, extraHeaders)
        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
})

app.post('/otp2/v1/bike-rental', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const tripPattern = await searchBikeRentalOtp2(params, extraHeaders)

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
})

app.all('*', (_, res) => {
    res.status(404).json({ error: '404 Not Found' })
})

app.use(errorLoggerMiddleware)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: Error, _1: express.Request, res: express.Response, _2: express.NextFunction) => {
    res.status(500).json({ error: error.message, stack: error.stack })
})

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${PORT}...`)
})

function getParams(params: RawSearchParams): SearchParams {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()
    const {
        filteredModes, subModesFilter, banned, whiteListed,
    } = filterModesAndSubModes(params.searchFilter)

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

function getHeadersFromClient(req: Request): ExtraHeaders {
    const clientName = req.get('ET-Client-Name')

    return clean({
        'X-Correlation-Id': req.get('X-Correlation-Id'),
        'ET-Client-Name': clientName ? `${clientName}-bff` : 'entur-search',
    })
}

function generateShamashLink({ query, variables }: GraphqlQuery): string {
    const host = process.env.ENVIRONMENT === 'prod'
        ? 'https://api.entur.io/journey-planner/v2/ide/'
        : `https://api.${process.env.ENVIRONMENT}.entur.io/journey-planner/v2/ide/`
    const q = encodeURIComponent(query.trim().replace(/\s+/g, ' '))

    if (variables) {
        const vars = encodeURIComponent(JSON.stringify(variables))
        return `${host}?query=${q}&variables=${vars}`
    }

    return `${host}?query=${q}`
}

interface ExtraHeaders { [key: string]: string }
