const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const lz = require('lz-string')

const app = express();
app.use(cors())
app.use(bodyParser.json())

const search = require('./search')

function generateNextCursor(params, results) {
    if (!results || !results.length) return

    const cursorData = {
        v: 1,
        params: {
            ...params,
            searchDate: results[results.length - 1].startTime
        }
    }

    return lz.compressToEncodedURIComponent(JSON.stringify(cursorData))
}

function parseCursor(cursor) {
    const parsed = JSON.parse(lz.decompressFromEncodedURIComponent(cursor))

    return {
        ...parsed,
        params: {
            ...parsed.params,
            searchDate: new Date(parsed.params.searchDate)
        }
    }
}

function getParams({ cursor, ...bodyParams }) {
    if (cursor) return parseCursor(cursor).params

    return {
            ...bodyParams,
            searchDate: new Date(bodyParams.searchDate),
        }
}

app.post('/transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const { tripPatterns, hasFlexibleTripPattern } = await search.transit(params)

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            nextCursor: generateNextCursor(params, tripPatterns)
        })
    } catch (error) {
        next(error)
    }
});

app.post('/non-transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const tripPatterns = await search.nonTransit(params)

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
});

app.post('/bike-rental', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const tripPattern = await search.bikeRental(params)

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
});

const PORT = process.env.PORT || 9000;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});
