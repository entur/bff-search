import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import { parseJSON } from 'date-fns'

import { SearchParams } from '../types'

import { searchTransit, searchNonTransit, searchBikeRental } from "./search"
import { parseCursor, generateCursor } from "./utils/cursor"

const app = express()

app.use(cors())
app.use(bodyParser.json())

app.post('/transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const { tripPatterns, hasFlexibleTripPattern } = await searchTransit(params)

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            nextCursor: generateCursor(params, tripPatterns),
        })
    } catch (error) {
        next(error)
    }
})

app.post('/non-transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const tripPatterns = await searchNonTransit(params)

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
})

app.post('/bike-rental', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const tripPattern = await searchBikeRental(params)

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
})

function getParams({ cursor, ...bodyParams }: SearchParams): SearchParams {
    if (cursor) return parseCursor(cursor).params

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
