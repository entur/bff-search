import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'

import { RawSearchParams, SearchParams } from '../../types'
import { clean } from '../../utils/object'
import { searchNonTransit } from '../../logic/otp2'

const router = Router()

interface ExtraHeaders {
    [key: string]: string
}

function getHeadersFromClient(req: Request): ExtraHeaders {
    const clientName = req.get('ET-Client-Name')

    return clean({
        'X-Correlation-Id': req.get('X-Correlation-Id'),
        'ET-Client-Name': clientName ? `${clientName}-bff` : 'entur-search',
    })
}

function getParams(
    params: RawSearchParams,
): Pick<SearchParams, 'from' | 'to' | 'searchDate'> {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()

    return {
        from: params.from,
        to: params.to,
        searchDate,
    }
}

router.post<
    '/',
    Record<string, never>,
    Awaited<ReturnType<typeof searchNonTransit>>,
    RawSearchParams
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
