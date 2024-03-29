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
            searchDate: parseJSON(params.searchDate),
        },
    }
}

export function generateCursor(
    params: SearchParams,
    otpCursor?: string | null,
): string | undefined {
    const cursorData = {
        v: 1,
        params: {
            ...params,
            useFlex: false,
            pageCursor: otpCursor,
        },
    }

    return compressToEncodedURIComponent(JSON.stringify(cursorData))
}
