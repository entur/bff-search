import {
    compressToEncodedURIComponent, decompressFromEncodedURIComponent,
} from "lz-string"
import { maxBy, minBy } from 'lodash'
import { addMinutes, subMinutes } from 'date-fns'

import { TripPattern } from '@entur/sdk'

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
        ? subMinutes(new Date(minBy(tripPatterns, 'endTime').endTime), 1)
        : addMinutes(new Date(maxBy(tripPatterns, 'startTime').startTime), 1)

    const cursorData = {
        v: 1,
        params: { ...params, searchDate: nextDate },
    };

    return compressToEncodedURIComponent(JSON.stringify(cursorData));
}
