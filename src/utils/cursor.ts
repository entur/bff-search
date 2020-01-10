import {
    compressToEncodedURIComponent, decompressFromEncodedURIComponent,
} from "lz-string"
import { addMinutes, subMinutes } from 'date-fns'

import { TripPattern } from '@entur/sdk'

import { maxBy, minBy } from './array'
import { isTransitAlternative } from './tripPattern'

import { CursorData, SearchParams } from '../../types'

export function parseCursor(cursor: string): CursorData {
    const parsed = JSON.parse(decompressFromEncodedURIComponent(cursor));

    return {
        ...parsed,
        params: {
            ...parsed.params,
            searchDate: new Date(parsed.params.searchDate),
        },
    };
}

export function generateCursor(params: SearchParams, tripPatterns?: TripPattern[]): string | void {
    const { arriveBy } = params
    const hasTransitPatterns = (tripPatterns || []).some(isTransitAlternative)

    if (!hasTransitPatterns) return

    const nextDate = arriveBy
        ? subMinutes(new Date(minBy(tripPatterns, getEndTime).endTime), 1)
        : addMinutes(new Date(maxBy(tripPatterns, getStartTime).startTime), 1)

    const cursorData = {
        v: 1,
        params: { ...params, searchDate: nextDate },
    };

    return compressToEncodedURIComponent(JSON.stringify(cursorData));
}

const getStartTime = (tripPattern: TripPattern): string => tripPattern.startTime

const getEndTime = (tripPattern: TripPattern): string => tripPattern.endTime
