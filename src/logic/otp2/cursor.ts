import {
    compressToEncodedURIComponent,
    decompressFromEncodedURIComponent,
} from 'lz-string'
import { parseJSON } from 'date-fns'

import { CursorData, SearchParams } from '../../types'

export function parseCursor(cursor?: string): CursorData | undefined {
    if (!cursor?.length) return undefined

    const decompressed = decompressFromEncodedURIComponent(cursor)
    if (!decompressed) return undefined

    const parsed = JSON.parse(decompressed)
    const { params } = parsed

    return {
        ...parsed,
        params: {
            ...params,
            initialSearchDate: parseJSON(params.initialSearchDate),
            searchDate: parseJSON(params.searchDate),
        },
    }
}

export function generateCursor(
    params: SearchParams,
    otpCursor?: string | null,
): string | undefined {
    // const { prevDateTime, nextDateTime, searchWindowUsed } = metadata

    // const nextDate = new Date(params.arriveBy ? prevDateTime : nextDateTime)

    const cursorData = {
        v: 1,
        params: {
            ...params,
            //      searchDate: nextDate,
            useFlex: false,
            pageCursor: otpCursor,
        },
    }

    return compressToEncodedURIComponent(JSON.stringify(cursorData))
}
