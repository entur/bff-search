import { Router } from 'express'

import nonTransitRouter, {
    /**
     * Import types so that `unused-exports` won't complain about these.
     * They need to be exported to be included in type declarations.
     */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    PostNonTransitRequestBody,
    PostNonTransitResponse,
    /* eslint-enable @typescript-eslint/no-unused-vars */
} from './non-transit'

import transitRouter, {
    /**
     * Import types so that `unused-exports` won't complain about these.
     * They need to be exported to be included in type declarations.
     */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    PostTransitRequestBody,
    PostTransitResponse,
    /* eslint-enable @typescript-eslint/no-unused-vars */
} from './transit'

import tripPatternsRouter from './trip-patterns'

const router = Router()

router.use('/transit', transitRouter)

router.use('/trip-patterns', tripPatternsRouter)

router.use('/non-transit', nonTransitRouter)

export default router
