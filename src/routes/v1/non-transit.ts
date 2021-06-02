import { Router, Request } from 'express'
import { parseJSON } from 'date-fns'

import { RawSearchParams, SearchParams } from '../../types'

import { clean } from '../../utils/object'
import { filterModesAndSubModes } from '../../utils/modes'

import { searchNonTransit } from '../../logic/otp1'

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

function getParams(params: RawSearchParams): SearchParams {
    const searchDate = params.searchDate
        ? parseJSON(params.searchDate)
        : new Date()
    const { filteredModes, subModesFilter, banned, whiteListed } =
        filterModesAndSubModes(params.searchFilter)

    return {
        ...params,
        searchDate,
        initialSearchDate: searchDate,
        modes: filteredModes,
        transportSubmodes: subModesFilter,
        banned,
        whiteListed,
        useFlex: true,
    }
}

router.post('/', async (req, res, next) => {
    try {
        const params = getParams(req.body)
        const extraHeaders = getHeadersFromClient(req)

        const tripPatterns = await searchNonTransit(params, extraHeaders)

        res.json({ tripPatterns })
    } catch (error) {
        next(error)
    }
})

export default router
