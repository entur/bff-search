import { createLogger, transports, format } from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'
import { getCorrelationId, getSessionId } from './utils/withCorrelationIds'

// StackDriver logger levels
// https://github.com/googleapis/nodejs-logging-winston/blob/afde0075e506fd38f9afee29a5277afa1f40a8b0/src/common.ts#L56
const LEVELS = {
    emergency: 0,
    alert: 1,
    critical: 2,
    error: 3,
    warning: 4,
    notice: 5,
    info: 6,
    debug: 7,
}

let sequenceNum = 0

const loggingWinston = new LoggingWinston({
    levels: LEVELS,
})

const transportsDev = [new transports.Console({ format: format.prettyPrint() })]
const transportsProd = [loggingWinston]

const logger = createLogger({
    level: 'debug',
    levels: LEVELS,
    format: format.combine(
        format((info) => {
            // Logging to Error Reporting only happens if a stack trace is supplied
            // (https://cloud.google.com/error-reporting/docs/formatting-error-messages)
            // This lets us keep error as part of metadata while not having to remember to
            // include stack all the time.

            // NB: This means that error has to be supplied as 'error' on the meta param when logging:
            // logger.error('my message', { error: myError })
            if (info.error && info.error.stack) {
                info.stack = info.error.stack
            }

            // Logging is async, so log lines for one function may not show up in sequence in the
            // log explorer. This number and serverTime lets us see the actual execution order.
            // (the sequence is shared between executions, combine with correlationId to see all
            // for a single user)
            info.sequenceNum = sequenceNum++
            info.serverTime = new Date().toISOString()

            const correlationId = getCorrelationId()
            info.correlationId = correlationId || 'NO CORRELATION ID'

            const sessionId = getSessionId()
            if (sessionId) {
                info.sessionId = sessionId
            }
            return info
        })(),
    ),
    transports:
        process.env.NODE_ENV === 'production' ? transportsProd : transportsDev,
})

export default logger
