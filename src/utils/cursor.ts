import {
    compressToEncodedURIComponent, decompressFromEncodedURIComponent,
} from "lz-string"
import { maxBy, minBy } from 'lodash'
import {
    addHours, addMinutes, differenceInHours, getDay, parseJSON, setHours, setMinutes, subMinutes,
} from 'date-fns'

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

export function generateCursor(params: SearchParams, tripPatterns?: TripPattern[]): string {
    const { arriveBy, initialSearchDate, searchDate } = params
    const hasTransitPatterns = (tripPatterns || []).some(isTransitAlternative)

    const previousDate = searchDate ? parseJSON(searchDate) : new Date()
    const initialDate = initialSearchDate ? parseJSON(initialSearchDate) : previousDate
    const nextDate = hasTransitPatterns
        ? getNextSearchDateFromResults(arriveBy, tripPatterns)
        : getNextSearchDateFromParams(arriveBy, previousDate, initialDate)

    console.log('INIT searchDate :', initialDate);
    console.log('PREV searchDate :', previousDate);
    console.log('NEXT searchDate :', nextDate);

    const cursorData = {
        v: 1,
        params: {
            ...params,
            initialSearchDate: initialDate,
            searchDate: nextDate,
        },
    };

    return compressToEncodedURIComponent(JSON.stringify(cursorData));
}

function getNextSearchDateFromResults(arriveBy: boolean, tripPatterns: TripPattern[]): Date {
    return arriveBy
    ? subMinutes(new Date(minBy(tripPatterns, 'endTime').endTime), 1)
    : addMinutes(new Date(maxBy(tripPatterns, 'startTime').startTime), 1)
}

function getNextSearchDateFromParams(arriveBy: boolean, previousDate: Date, initialDate: Date): Date {
    const hoursSinceInitialSearch = Math.abs(differenceInHours(initialDate , previousDate))
    const sign = arriveBy ? -1 : 1
    const searchDateOffset = hoursSinceInitialSearch === 0
        ? sign * 2
        : sign * hoursSinceInitialSearch * 3

    const nextSearchDate = addHours(previousDate, searchDateOffset)

    if (getDay(nextSearchDate) === getDay(initialDate)) return nextSearchDate

    return arriveBy
        ? setMinutes(setHours(nextSearchDate, 23), 59)
        : setMinutes(setHours(nextSearchDate, 0), 1)
}
