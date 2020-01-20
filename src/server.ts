import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import { parseJSON } from 'date-fns'

import { RawSearchParams, SearchParams } from '../types'

import {
    searchTransitWithTaxi, searchTransit, searchNonTransit, searchBikeRental,
} from "./search"
import { parseCursor, generateCursor } from "./utils/cursor"
import { filterModesAndSubModes } from "./utils/modes"

const PORT = process.env.PORT || 9000
const app = express()

app.use(cors())
app.use(bodyParser.json())

app.post('/v1/transit', async ({ body }, res, next) => {
    try {
        const cursorData = parseCursor(body?.cursor)
        const params = cursorData?.params || getParams(body)
        const { tripPatterns, hasFlexibleTripPattern, isSameDaySearch } = cursorData
            ? await searchTransit(params)
            : await searchTransitWithTaxi(params)

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

app.post('/v1/non-transit', async ({ body }, res, next) => {
    try {
        const params = getParams(body)
        const tripPatterns = await searchNonTransit(params)

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
})

app.post('/v1/bike-rental', async ({ body }, res, next) => {
    try {
        const params = getParams(body)
        const tripPattern = await searchBikeRental(params)

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
})

app.all('*', (_, res) => {
    res.status(404).json({ error: '404 Not Found' })
})

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
