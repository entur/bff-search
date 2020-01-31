import winston from 'winston'
import { LoggingWinston } from '@google-cloud/logging-winston'

const loggingWinston = new LoggingWinston()

const transportsDev = [new winston.transports.Console()]
const transportsProd = [loggingWinston]

const logger = winston.createLogger({
    level: 'info',
    transports: process.env.NODE_ENV === 'production' ? transportsProd : transportsDev,
})

export default logger
