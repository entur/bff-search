import { Router } from 'express'

import nonTransitRouter from './non-transit'
import transitRouter from './transit'
import tripPatternsRouter from './trip-patterns'

const router = Router()

router.use('/transit', transitRouter)

router.use('/trip-patterns', tripPatternsRouter)

router.use('/non-transit', nonTransitRouter)

export default router
