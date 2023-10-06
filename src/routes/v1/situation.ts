import { Router } from 'express'

import { SituationResponse } from '../../types'
import { getSituation } from '../../logic/otp2'
import { getHeadersFromClient } from './helper'

const router = Router()

router.get<'/:situationNumber', { situationNumber: string }, SituationResponse>(
    '/:situationNumber',
    async (req, res, next) => {
        const situationNumber = req.params.situationNumber

        const extraHeaders = getHeadersFromClient(req)

        try {
            const situation = await getSituation(situationNumber, extraHeaders)

            if (situation) res.json(situation)
            else res.status(404)
        } catch (error) {
            next(error)
        }
    },
)

export default router
