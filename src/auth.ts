import jwt from 'express-jwt'
import jwksRsa from 'jwks-rsa'
import { Request, Response, NextFunction } from 'express'

const PARTNER_AUDIENDE = process.env.PARTNER_AUDIENCE
const PARTNER_HOST = process.env.PARTNER_HOST

export const verifyPartnerToken = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${PARTNER_HOST}/.well-known/jwks.json`,
    }),
    audience: [PARTNER_AUDIENDE],
    issuer: `${PARTNER_HOST}/`,
    algorithms: ['RS256'],
})

export function unauthorizedError(error: Error, _req: Request, res: Response, next: NextFunction): void {
    if (error.name === 'UnauthorizedError') {
        res.status(401).send(error.message)
        return
    }
    next(error)
}
