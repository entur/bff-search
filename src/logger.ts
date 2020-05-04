import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'
import { Request, Response, NextFunction } from 'express'
import { get as getTracerAgent } from '@google-cloud/trace-agent'

import { clean } from './utils/object'

const loggingWinston = new LoggingWinston()

const transportsDev = [new winston.transports.Console()]
const transportsProd = [loggingWinston]

const transports = process.env.NODE_ENV === 'production' ? transportsProd : transportsDev

const logger = winston.createLogger({
    level: 'debug',
    transports,
})

function reqBodyMapper(req: Request): Record<string, any> {
    return {
        ...req.body,
        from: clean<string>({
            ...req.body.from,
            name: undefined,
        }),
        to: clean<string>({
            ...req.body.to,
            name: undefined,
        }),
    }
}

function reqHeadersMapper(req: Request): { [key: string]: string } {
    return clean({
        'X-Correlation-Id': req.get('X-Correlation-Id'),
        'ET-Client-Name': req.get('ET-Client-Name'),
        'Content-Length': req.get('Content-Length'),
    })
}

export function getTraceInfo(): object {
    return {
        [LoggingWinston.LOGGING_TRACE_KEY]: getCurrentTraceFromAgent(),
    }
}

export function reqResLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
    logger.info(`Request ${req.method} ${req.url}`, {
        body: reqBodyMapper(req),
        headers: reqHeadersMapper(req),
        [LoggingWinston.LOGGING_TRACE_KEY]: getCurrentTraceFromAgent(),
    })

    const originalResEnd = res.end
    res.end = (chunk: any, ...rest: any[]) => {
        // @ts-ignore
        originalResEnd.call(res, chunk, ...rest)
        res.end = originalResEnd

        logger.info(`Response ${req.method} ${req.url}`, {
            req: {
                headers: reqHeadersMapper(req),
            },
            ...getTraceInfo(),
        })
    }
    next()
}

export function logError(error: Error, level: 'warn' | 'error', req: Request): void {
    logger.log({
        level,
        message: error.message,
        stack: error.stack,
        req: {
            body: reqBodyMapper(req),
            headers: reqHeadersMapper(req),
        },
        ...getTraceInfo(),
    })
}

// From: https://github.com/googleapis/nodejs-logging-winston/blob/master/src/common.ts#L57
function getCurrentTraceFromAgent(): string | null {
    const agent = getTracerAgent()
    if (!agent || !agent.getCurrentContextId || !agent.getWriterProjectId) {
        return null
    }

    const traceId = agent.getCurrentContextId()
    if (!traceId) {
        return null
    }

    const traceProjectId = agent.getWriterProjectId()
    if (!traceProjectId) {
        return null
    }

    return `projects/${traceProjectId}/traces/${traceId}`
}

export default logger
