import {
    compressToEncodedURIComponent, decompressFromEncodedURIComponent,
} from "lz-string"
import { maxBy, minBy } from 'lodash'
import { addMinutes, subMinutes } from 'date-fns'

import { TripPattern } from '@entur/sdk'

import { SearchParams } from '../../types'

export function parseCursor(cursor: string) {
    const parsed = JSON.parse(decompressFromEncodedURIComponent(cursor));

    return {
        ...parsed,
        params: {
            ...parsed.params,
            searchDate: new Date(parsed.params.searchDate),
        },
    };
}

export function generateCursor(params: SearchParams, tripPatterns?: TripPattern[]) {
    if (!tripPatterns?.length) return

    const searchDate = getNextSearchDate(tripPatterns, params.arriveBy)
    const cursorData = {
        v: 1,
        params: { ...params, searchDate },
    };

    return compressToEncodedURIComponent(JSON.stringify(cursorData));
}

function getNextSearchDate(tripPatterns: TripPattern[], arriveBy: boolean): Date {
    return arriveBy
        ? subMinutes(new Date(minBy(tripPatterns, 'endTime').endTime), 1)
        : addMinutes(new Date(maxBy(tripPatterns, 'startTime').startTime), 1)
}
