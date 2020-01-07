const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const lz = require('lz-string')

const app = express();
app.use(cors())
app.use(bodyParser.json())

const search = require('./search')

function generateNextCursor(params, results) {
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

app.post('/nontransit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const nonTransitTripPatterns = await search.nontransit(params)

        res.json({ nonTransitTripPatterns })
    } catch (error) {
        next(error)
    }
});

app.post('/', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const tripPatterns = await search.transit(params)

        res.json({
            tripPatterns,
            nextCursor: generateNextCursor(params, tripPatterns)
        })
    } catch (error) {
        next(error)
    }
});

const PORT = process.env.PORT || 9000;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});
