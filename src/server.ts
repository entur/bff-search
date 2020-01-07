import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import lz from "lz-string";

import search from "./search";

const app = express();

app.use(cors());
app.use(bodyParser.json());

function generateNextCursor(params: any, results: any) {
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

app.post("/", async (req, res, next) => {
    try {
        const { cursor, ...bodyParams } = req.body;

        let params;

        if (cursor) {
            const parsedCursor = parseCursor(cursor);
            params = parsedCursor.params;
        } else {
            params = bodyParams;
            params.searchDate = new Date(params.searchDate);
        }

        const tripPatterns = await search(params, {
            ignoreNonTransit: false,
        });

        res.json({
            tripPatterns,
            nextCursor: generateNextCursor(params, tripPatterns),
        });
    } catch (error) {
        next(error);
    }
});

const PORT = process.env.PORT || 9000;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});
