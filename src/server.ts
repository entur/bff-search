// The tracer must be the first import in order to track time to import the other stuff
import './tracer'

import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'

import './cache'
import { reqResLoggerMiddleware } from './logger'
import { NotFoundError, InvalidArgumentError } from './errors'
import { unauthorizedError } from './auth'

import otp1Router from './otp1'
import otp2Router from './otp2'

const PORT = process.env.PORT || 9000
const app = express()

app.use(
    bodyParser.json({
        limit: '10mb',
    }),
)

app.use(reqResLoggerMiddleware)
app.use(cors())

app.get('/_ah/warmup', (_req, res) => {
    import('./cache')
    res.end()
})

app.use('/otp2', otp2Router)
app.use('/', otp1Router)

app.all('*', (_, res) => {
    res.status(404).json({ error: '404 Not Found' })
})

app.use(unauthorizedError)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: Error, _req: express.Request, res: express.Response, _2: express.NextFunction) => {
    let statusCode = 500
    if (error instanceof NotFoundError) {
        statusCode = 404
    } else if (error instanceof InvalidArgumentError) {
        statusCode = 400
    }

    res.status(statusCode).json({ error: error.message, stack: error.stack })
})

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${PORT}...`)
})
