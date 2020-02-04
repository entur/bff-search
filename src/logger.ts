import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'
import expressWinston from 'express-winston'
import { Request, Response } from 'express'

const loggingWinston = new LoggingWinston()

const transportsDev = [new winston.transports.Console()]
const transportsProd = [loggingWinston]

const transports = process.env.NODE_ENV === 'production' ? transportsProd : transportsDev

const logger = winston.createLogger({
    level: 'info',
    transports,
})

type ExpressWinstonResponse = Response & {
    responseTime: number
    body?: string | object
}

export const requestLoggerMiddleware = expressWinston.logger({
    transports,
    metaField: undefined,
    responseField: undefined,
    requestWhitelist: ['headers', 'query', 'body'],
    responseWhitelist: ['body'],
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

export const errorLoggerMiddleware = expressWinston.errorLogger({
    transports,
    msg: '{{req.method}} {{req.url}} {{err.message}}',
    requestWhitelist: ['headers', 'query', 'body'],
})

export default logger
