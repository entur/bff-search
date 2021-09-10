import { AsyncLocalStorage } from 'async_hooks'

import { Request } from 'express'
import { v4 as uuid } from 'uuid'

import logger from '../logger'

interface Store {
    sessionId?: string | undefined
    correlationId: string
}

const asyncLocalStorage = new AsyncLocalStorage<Store>()

export const withCorrelationIds = (req: Request, work: () => void): void => {
    const correlationId = req.get('X-Correlation-Id')
    if (!correlationId) {
        logger.warning('No correlation id in request', { path: req.path })
    }
    const sessionId = req.get('X-Session-Id')
    return asyncLocalStorage.run(
        {
            sessionId: sessionId || '',
            correlationId: correlationId || uuid(),
        },
        () => work(),
    )
}

export const getSessionId = (): string | undefined => {
    const store = asyncLocalStorage.getStore()
    return store?.sessionId
}

export const getCorrelationId = (): string | undefined => {
    const store = asyncLocalStorage.getStore()
    return store?.correlationId
}
