// Some inspiration taken from the express-winston library by bithavoc: https://github.com/bithavoc/express-winston/blob/master/index.js
import { NextFunction, Request, Response } from 'express'
import { LoggingWinston } from '@google-cloud/logging-winston'
import logger from '../../logger'
import { clean } from '../object'
import { get as getTracerAgent } from '@google-cloud/trace-agent'

function getTraceInfo(): Record<string, string | null> {
    return {
        [LoggingWinston.LOGGING_TRACE_KEY]: getCurrentTraceFromAgent(),
    }
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
        'X-Session-Id': req.get('X-Session-Id'),
        'ET-Client-Name': req.get('ET-Client-Name'),
        'ET-Client-Version': req.get('ET-Client-Version'),
        'ET-Client-Platform': req.get('ET-Client-Platform'),
        'Content-Length': req.get('Content-Length'),
        'Content-Type': req.get('Content-Type'),
        'User-Agent': req.get('User-Agent'),
        Origin: req.get('Origin'),
    })
}

function reqResLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const startTime = new Date()
    const { method, url } = req

    logger.info(`Request ${req.method} ${req.url}`, {
        body: reqBodyMapper(req),
        headers: reqHeadersMapper(req),
        method,
        url,
        [LoggingWinston.LOGGING_TRACE_KEY]: getCurrentTraceFromAgent(),
    })

    const originalResEnd = res.end
    res.end = (chunk: any, ...rest: any[]) => {
        // @ts-ignore
        originalResEnd.call(res, chunk, ...rest)
        res.end = originalResEnd

        const responseTime = new Date().getTime() - startTime.getTime()

        let level = 'info'
        let response = undefined
        let message = `Response ${res.statusCode} ${req.method} ${req.url}`

        if (res.statusCode >= 400) {
            level = 'warning'

            response = chunk && chunk.toString()
            if (`${res.getHeader('content-type')}`.includes('json')) {
                try {
                    response = JSON.parse(response)
                } catch (error) {
                    logger.warning(error)
                }

                if (response?.message) {
                    message += ` – ${response?.message || ''}`
                }
            }
        }

        if (res.statusCode >= 500) {
            level = 'error'
        }

        logger.log({
            level,
            message,
            req: {
                headers: reqHeadersMapper(req),
            },
            res: response,
            status: res.statusCode,
            responseTime,
            method,
            url,
            ...getTraceInfo(),
        })
    }
    next()
}

export default reqResLoggerMiddleware
