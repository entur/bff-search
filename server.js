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

app.post('/', async (req, res, next) => {
    try {
        const { cursor, ...bodyParams } = req.body

        let params

        if (cursor) {
            const parsedCursor = parseCursor(cursor);
            params = parsedCursor.params
        } else {
            params = bodyParams
            params.searchDate = new Date(params.searchDate)
        }

        const tripPatterns = await search(params, {
            ignoreNonTransit: false
        })

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
