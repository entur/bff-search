import { expressjwt, GetVerificationKey } from 'express-jwt'
import { expressJwtSecret } from 'jwks-rsa'
import { Request, Response, NextFunction } from 'express'

import { PARTNER_AUDIENCE, PARTNER_HOST } from './config'

export const verifyPartnerToken = expressjwt({
    secret: expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${PARTNER_HOST}/.well-known/jwks.json`,
    }) as GetVerificationKey, // https://github.com/auth0/express-jwt/issues/288#issuecomment-1122524366
    audience: [PARTNER_AUDIENCE],
    issuer: `${PARTNER_HOST}/`,
    algorithms: ['RS256'],
})

export function unauthorizedError(
    error: Error,
    _req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (error.name === 'UnauthorizedError') {
        res.status(401).send(error.message)
        return
    }
    next(error)
}
