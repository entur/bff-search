import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { addMinutes, subMinutes, parseJSON } from 'date-fns'

import { TripPattern } from '@entur/sdk'

import { maxBy, minBy } from '../utils/array'
import { isTransitAlternative, isFlexibleAlternative } from '../utils/tripPattern'

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

export function generateCursor(params: SearchParams, tripPatterns: TripPattern[] = []): string | undefined {
    const { arriveBy } = params
    const hasTransitPatterns = tripPatterns.some(isTransitAlternative)
    const hasFlexiblePatterns = tripPatterns.some(isFlexibleAlternative)

    if (!tripPatterns.length || !hasTransitPatterns) return

    const nextDate = arriveBy
        ? subMinutes(new Date(minBy(tripPatterns, getEndTime).endTime), 1)
        : addMinutes(new Date(maxBy(tripPatterns, getStartTime).startTime), 1)

    const cursorData = {
        v: 1,
        params: { ...params, searchDate: nextDate, useFlex: hasFlexiblePatterns },
    }

    return compressToEncodedURIComponent(JSON.stringify(cursorData))
}

const getStartTime = (tripPattern: TripPattern): string => tripPattern.startTime

const getEndTime = (tripPattern: TripPattern): string => tripPattern.endTime
