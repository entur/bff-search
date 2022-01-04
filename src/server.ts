// The tracer must be the first import in order to track time to import the other stuff
import './tracer'

import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'

import './cache'
import logger from './logger'
import {
    NotFoundError,
    InvalidArgumentError,
    TripPatternExpiredError,
} from './errors'
import { unauthorizedError } from './auth'

import v1Router from './routes/v1'
import correlationIdsMiddleware from './utils/middleware/correlationIdsMiddleware'
import reqResLoggerMiddleware from './utils/middleware/reqResLoggerMiddleware'

const PORT = process.env.PORT || 9000
const app = express()

app.use(
    bodyParser.json({
        limit: '10mb',
    }),
)

app.use(correlationIdsMiddleware)
if (process.env.NODE_ENV === 'production') {
    app.use(reqResLoggerMiddleware)
}
app.use(cors())

app.get('/_ah/warmup', (_req, res) => {
    import('./cache').catch((error) =>
        logger.error('Failed to import cache in warmup handler', error),
    )
    res.end()
})

app.use(
    '/otp2/v1',
    (_req, res, next) => {
        res.locals.forceOtp2 = true
        next()
    },
    v1Router,
)
app.use(
    '/otp1/v1',
    (req, res, next) => {
        res.locals.forceOtp1 = true
        next()
    },
    v1Router,
)

app.use('/v1', v1Router)

app.all('*', (_, res) => {
    res.status(404).json({ error: '404 Not Found' })
})

app.use(unauthorizedError)

app.use(
    (
        error: Error,
        _req: express.Request,
        res: express.Response,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _2: express.NextFunction,
    ) => {
        const name = error.constructor?.name || 'Error'
        let statusCode = 500
        if (error instanceof TripPatternExpiredError) {
            return res.status(404).json({
                error: error.message,
                searchParams: error.getSearchParams(),
                name,
            })
        } else if (error instanceof NotFoundError) {
            statusCode = 404
        } else if (error instanceof InvalidArgumentError) {
            statusCode = 400
        }

        logger.log({
            ...error,
            level: statusCode >= 500 ? 'error' : 'warning',
        })

        res.status(statusCode).json({
            error: error.message,
            name,
        })
    },
)

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${PORT}...`)
})
