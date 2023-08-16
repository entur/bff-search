import { Router } from 'express'
import { parseJSON } from 'date-fns'

import { RawSearchParams, SearchParams } from '../../types'
import { searchNonTransit } from '../../logic/otp2'
import { filterCoordinates } from '../../utils/searchParams'

import { getHeadersFromClient } from './helper'

const router = Router()

function getParams(
    params: RawSearchParams,
): Pick<SearchParams, 'from' | 'to' | 'searchDate'> {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()

    return {
        from: filterCoordinates(params.from),
        to: filterCoordinates(params.to),
        searchDate,
    }
}

export type PostNonTransitResponse = Awaited<
    ReturnType<typeof searchNonTransit>
>

export type PostNonTransitRequestBody = RawSearchParams

router.post<
    '/',
    Record<string, never>,
    PostNonTransitResponse,
    PostNonTransitRequestBody
>('/', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)
        const result = await searchNonTransit(params, extraHeaders)

        res.json(result)
    } catch (error) {
        next(error)
    }
})

export default router
