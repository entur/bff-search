import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { parseJSON } from 'date-fns'

import { TripPattern } from '@entur/sdk'

import { isTransitAlternative, isFlexibleAlternative } from '../utils/tripPattern'

import { CursorData, SearchParams } from '../../types'
import { Metadata } from './controller'

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
    metadata: Metadata | undefined,
    tripPatterns: TripPattern[] = [],
): string | undefined {
    const hasTransitPatterns = tripPatterns.some(isTransitAlternative)
    const hasFlexiblePatterns = tripPatterns.some(isFlexibleAlternative)

    if (!metadata || !tripPatterns.length || !hasTransitPatterns) return

    const nextDate = new Date(metadata.nextDateTime)

    const cursorData = {
        v: 1,
        params: { ...params, searchDate: nextDate, useFlex: hasFlexiblePatterns },
    }

    return compressToEncodedURIComponent(JSON.stringify(cursorData))
}
