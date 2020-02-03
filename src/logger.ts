import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'
import expressWinston from 'express-winston'
import { Request, Response } from 'express'

const loggingWinston = new LoggingWinston()

const transportsDev = [new winston.transports.Console()]
const transportsProd = [loggingWinston]

const logger = winston.createLogger({
    level: 'info',
    transports: process.env.NODE_ENV === 'production' ? transportsProd : transportsDev,
})

type ExpressWinstonResponse = Response & {
    responseTime: number
    body?: string | object
}

export const requestLoggerMiddleware = expressWinston.logger({
    transports: [new LoggingWinston({})],
    metaField: undefined, // this causes the metadata to be stored at the root of the log entry
    responseField: undefined, // this prevents the response from being included in the metadata (including body and status code)
    requestWhitelist: ['headers', 'query', 'body'],  // these are not included in the standard StackDriver httpRequest
    responseWhitelist: ['body'], // this populates the `res.body` so we can get the response size (not required)
    // @ts-ignore Library is using the wrong 'Request' type
    dynamicMeta: (req: Request, res: ExpressWinstonResponse) => {
        const meta: Record<string, any> = {}

        if (req) {
            meta.httpRequest = {
                requestMethod: req.method,
                requestUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
                protocol: `HTTP/${req.httpVersion}`,
                requestSize: req.socket.bytesRead,
                userAgent: req.get('User-Agent'),
                referrer: req.get('Referrer'),
            }
        }

        if (res) {
            meta.httpRequest = {
                ...meta.httpRequest,
                status: res.statusCode,
                latency: {
                    seconds: Math.floor(res.responseTime / 1000),
                    nanos: (res.responseTime % 1000 ) * 1000000,
                },
            }
            if (res.body) {
                if (typeof res.body === 'object') {
                    meta.httpRequest.responseSize = JSON.stringify(res.body).length
                } else if (typeof res.body === 'string') {
                    meta.httpRequest.responseSize = res.body.length
                }
            }
        }
        return meta
    },
})

export default logger
