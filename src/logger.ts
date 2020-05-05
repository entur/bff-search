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

// Some inspiration taken from the express-winston library by bithavoc: https://github.com/bithavoc/express-winston/blob/master/index.js
export function reqResLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
    logger.info(`Request ${req.method} ${req.url}`, {
        body: reqBodyMapper(req),
        headers: reqHeadersMapper(req),
        correlationId: req.get('X-Correlation-Id'),
        [LoggingWinston.LOGGING_TRACE_KEY]: getCurrentTraceFromAgent(),
    })

    const originalResEnd = res.end
    res.end = (chunk: any, ...rest: any[]) => {
        // @ts-ignore
        originalResEnd.call(res, chunk, ...rest)
        res.end = originalResEnd

        let level = 'info'
        let response = undefined

        if (res.statusCode >= 400) {
            level = 'warn'

            response = chunk && chunk.toString()
            if (`${res.getHeader('content-type')}`.includes('json')) {
                response = JSON.parse(response)
            }
        }

        if (res.statusCode >= 500) {
            level = 'error'
        }

        logger.log({
            level,
            message: `Response ${res.statusCode} ${req.method} ${req.url}`,
            req: {
                headers: reqHeadersMapper(req),
            },
            res: response,
            correlationId: req.get('X-Correlation-Id'),
            ...getTraceInfo(),
        })
    }
    next()
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
