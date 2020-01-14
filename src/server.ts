import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import { parseJSON } from 'date-fns'

import { SearchParams } from '../types'

import {
    searchWithTaxi, search, searchNonTransit, searchBikeRental,
} from "./search"
import { parseCursor, generateCursor } from "./utils/cursor"

const app = express()

app.use(cors())
app.use(bodyParser.json())

app.post('/', async ({ body }, res, next) => {
    try {
        const cursor = body?.cursor
        const params = getParams(body)
        const { tripPatterns, hasFlexibleTripPattern, isSameDaySearch } = cursor?.length || params.skipTaxi
            ? await search(parseCursor(cursor).params)
            : await searchWithTaxi(params)

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            isSameDaySearch,
            nextCursor: generateCursor(params, tripPatterns),
        })
    } catch (error) {
        next(error)
    }
})

app.post('/non-transit', async ({ body }, res, next) => {
    try {
        const params = getParams(body)
        const tripPatterns = await searchNonTransit(params)

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
})

app.post('/bike-rental', async ({ body }, res, next) => {
    try {
        const params = getParams(body)
        const tripPattern = await searchBikeRental(params)

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
})

app.all('*', (_, res) => {
    res.status(404).json({ error: '404 Not Found'})
})

app.use((error: Error, _1: express.Request, res: express.Response, _2: express.NextFunction) => {
    res.status(500).json({ error: error.message, stack: error.stack })
})

function getParams({ cursor, ...bodyParams }: SearchParams): SearchParams {
    const searchDate = bodyParams.searchDate
        ? parseJSON(bodyParams.searchDate)
        : new Date()

    return {
        ...bodyParams,
        searchDate,
        initialSearchDate: searchDate,
    }
}

const PORT = process.env.PORT || 9000

app.listen(PORT, () => {
    // tslint:disable-next-line:no-console
    console.log(`Server listening on port ${PORT}...`)
})
