import { NextFunction, Request, Response } from 'express'

import { withCorrelationIds } from '../withCorrelationIds'

export default function correlationIdsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (req.method === 'OPTIONS') {
        next()
    } else {
        return withCorrelationIds(req, next)
    }
}
