import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'
import { Request, Response, NextFunction } from 'express'

import { clean } from './utils/object'

const loggingWinston = new LoggingWinston()

const transportsDev = [new winston.transports.Console()]
const transportsProd = [loggingWinston]

const transports = process.env.NODE_ENV === 'production' ? transportsProd : transportsDev

const logger = winston.createLogger({
    level: 'info',
    transports,
})

function reqBodyMapper(body: Record<string, any>): Record<string, any> {
    return {
        ...body,
        from: clean<string>({
            ...body.from,
            name: undefined,
        }),
        to: clean<string>({
            ...body.to,
            name: undefined,
        }),
    }
}

function reqHeadersMapper(req: Request): {[key: string]: string} {
    return clean({
        'X-Correlation-Id': req.get('X-Correlation-Id'),
        'ET-Client-Name': req.get('ET-Client-Name'),
    })
}

export function reqResLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
    logger.info(`Request ${req.method} ${req.url}`, {
        body: reqBodyMapper(req.body),
        headers: req.headers,
    })

    const originalResEnd = res.end
    res.end = (chunk: any, ...rest: any[]) => {
        // @ts-ignore
        originalResEnd.call(res, chunk, ...rest)
        res.end = originalResEnd

        const resBody = chunk ? JSON.parse(chunk.toString()) : undefined

        logger.info(`Response ${req.method} ${req.url}`, {
            body: resBody,
            reqHeaders: reqHeadersMapper(req),
        })
    }
    next()
}

export function errorLoggerMiddleware(error: Error, req: Request, _res: Response, next: NextFunction): void {
    logger.error(error.message, {
        stack: error.stack,
        req: {
            body: reqBodyMapper(req.body),
            headers: reqHeadersMapper(req),
        },
    })
    next(error)
}

export default logger
