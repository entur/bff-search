import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import lz from "lz-string";

import {
    searchTransit, searchNonTransit, searchBikeRental,
} from "./search";

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.post('/transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const { tripPatterns, hasFlexibleTripPattern } = await searchTransit(params)

        res.json({
            tripPatterns,
            hasFlexibleTripPattern,
            nextCursor: generateNextCursor(params, tripPatterns),
        })
    } catch (error) {
        next(error)
    }
});

app.post('/non-transit', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const tripPatterns = await searchNonTransit(params)

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
});

app.post('/bike-rental', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const tripPattern = await searchBikeRental(params)

        res.json({ tripPattern })
    } catch (error) {
        next(error)
    }
});

function generateNextCursor(params: any, results: any) {
    if (!results || !results.length) return

    const cursorData = {
        v: 1,
        params: {
            ...params,
            searchDate: results[results.length - 1].startTime,
        },
    };

    return lz.compressToEncodedURIComponent(JSON.stringify(cursorData));
}

function parseCursor(cursor: string) {
    const parsed = JSON.parse(lz.decompressFromEncodedURIComponent(cursor));

    return {
        ...parsed,
        params: {
            ...parsed.params,
            searchDate: new Date(parsed.params.searchDate),
        },
    };
}

function getParams({ cursor, ...bodyParams }: any) {
    if (cursor) return parseCursor(cursor).params

    return {
            ...bodyParams,
            searchDate: new Date(bodyParams.searchDate),
        }
}

const PORT = process.env.PORT || 9000;

app.listen(PORT, () => {
    // tslint:disable-next-line:no-console
    console.log(`Server listening on port ${PORT}...`);
});
