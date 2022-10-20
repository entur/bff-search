import {
    addDays,
    differenceInMinutes,
    endOfDay,
    parseISO,
    startOfDay,
    subDays,
} from 'date-fns'
import cleanDeep from 'clean-deep'
import { v4 as uuid } from 'uuid'

import {
    Authority,
    GraphqlQuery,
    IntermediateEstimatedCall,
    Leg,
    Metadata,
    Notice,
    SearchParams,
    TripPattern,
    TripPatternParsed,
} from '../../types'
import { GetTripPatternsQueryVariables } from '../../generated/graphql'
import { parseLeg } from '../../utils/leg'
import { isNotNullOrUndefined } from '../../utils/misc'

import JOURNEY_PLANNER_QUERY from './query'

export function getQueryVariables({
    numTripPatterns,
    from,
    to,
    searchDate,
    arriveBy,
    modes,
    walkSpeed,
    minimumTransferTime,
    searchWindow,
    walkReluctance,
    waitReluctance,
    transferPenalty,
}: SearchParams): GetTripPatternsQueryVariables {
    return {
        numTripPatterns,
        from,
        to,
        dateTime: searchDate.toISOString(),
        arriveBy: Boolean(arriveBy),
        wheelchairAccessible: false,
        modes,
        walkSpeed,
        transferSlack: minimumTransferTime,
        transferPenalty,
        banned: undefined,
        whiteListed: undefined,
        debugItineraryFilter: false,
        searchWindow,
        walkReluctance,
        waitReluctance,
    }
}

export function getNextQueryVariables(
    searchParams: GetTripPatternsQueryVariables,
    metaData: Metadata | undefined,
): GetTripPatternsQueryVariables {
    const { arriveBy, dateTime } = searchParams

    const searchDate = parseISO(dateTime)
    // Metadata will be null if routingErrors is not empty, because searchWindow
    // cannot be calculated.
    if (metaData) {
        const metaDateTime = arriveBy
            ? metaData.prevDateTime
            : metaData.nextDateTime

        return {
            ...searchParams,
            searchWindow: metaData.searchWindowUsed,
            dateTime: metaDateTime,
        }
    } else {
        const nextMidnight = arriveBy
            ? endOfDay(subDays(searchDate, 1))
            : startOfDay(addDays(searchDate, 1))

        return {
            ...searchParams,
            dateTime: nextMidnight.toISOString(),
        }
    }
}

export const cleanQueryVariables = (
    variables: GetTripPatternsQueryVariables,
): GetTripPatternsQueryVariables =>
    cleanDeep(variables, {
        emptyArrays: false,
        emptyObjects: false,
        emptyStrings: false,
    }) as GetTripPatternsQueryVariables

export function getMinutesBetweenDates(
    a: Date,
    b: Date,
    limits?: { min: number; max?: number },
): number {
    const min = limits?.min || 0
    const max = limits?.max || Infinity
    const diff = Math.abs(differenceInMinutes(a, b))
    return Math.max(min, Math.min(max, diff))
}

function sortTripPatternsByExpectedTime<T extends TripPattern>(
    tripPatterns: T[],
    arriveBy: boolean,
): T[] {
    // eslint-disable-next-line fp/no-mutating-methods
    return tripPatterns.sort((a, b) => {
        if (arriveBy) return a.expectedEndTime > b.expectedEndTime ? -1 : 1
        return a.expectedStartTime < b.expectedStartTime ? -1 : 1
    })
}

export function getNextSearchDateFromMetadata(
    metadata: Metadata,
    arriveBy = false,
): Date {
    const dateTime = arriveBy ? metadata.prevDateTime : metadata.nextDateTime
    return parseISO(dateTime)
}

export function combineAndSortFlexibleAndTransitTripPatterns(
    regularTripPatterns: TripPatternParsed[],
    flexibleTripPattern?: TripPatternParsed,
    nextDateTime?: Date,
    arriveBy = false,
): TripPatternParsed[] {
    if (!flexibleTripPattern) return regularTripPatterns

    const sortedTripPatterns = sortTripPatternsByExpectedTime(
        [flexibleTripPattern, ...regularTripPatterns],
        arriveBy,
    )

    if (!nextDateTime) {
        return sortedTripPatterns
    }

    const flexIsOutsideTransitSearchWindowUsed = arriveBy
        ? parseISO(flexibleTripPattern.expectedEndTime) < nextDateTime
        : parseISO(flexibleTripPattern.expectedStartTime) > nextDateTime

    if (flexIsOutsideTransitSearchWindowUsed) {
        return regularTripPatterns
    }

    return sortedTripPatterns
}

export function getTripPatternsQuery(
    variables: GetTripPatternsQueryVariables,
    comment: string,
): GraphqlQuery {
    return {
        query: JOURNEY_PLANNER_QUERY,
        variables: cleanQueryVariables(variables),
        comment,
    }
}

export function createParseTripPattern(): (
    rawTripPattern: TripPattern,
) => TripPatternParsed {
    let i = 0
    const sharedId = uuid()
    const baseId = sharedId.substring(0, 23)
    const iterator = parseInt(sharedId.substring(24), 16)

    return (rawTripPattern: TripPattern): TripPatternParsed => {
        i++
        const id = `${baseId}-${(iterator + i).toString(16).slice(-12)}`
        return parseTripPattern({ id, ...rawTripPattern })
    }
}

function parseTripPattern(
    rawTripPattern: TripPatternParsed,
): TripPatternParsed {
    return {
        ...rawTripPattern,
        id: rawTripPattern.id || uuid(),
        legs: rawTripPattern.legs.map(parseLeg),
    }
}

function uniqBy<T, K>(arr: T[], getKey: (arg: T) => K): T[] {
    return [
        ...arr
            .reduce((map, item) => {
                const key = getKey(item)

                if (!map.has(key)) {
                    map.set(key, item)
                }

                return map
            }, new Map())
            .values(),
    ]
}

function getNoticesFromIntermediateEstimatedCalls(
    estimatedCalls: IntermediateEstimatedCall[],
): Notice[] {
    if (!estimatedCalls?.length) return []
    return estimatedCalls
        .flatMap(({ notices }) => notices)
        .filter((notice): notice is Notice => Boolean(notice.text))
}

function getNotices(leg: Leg): Notice[] {
    const notices: Notice[] = [
        ...getNoticesFromIntermediateEstimatedCalls(
            leg.intermediateEstimatedCalls?.filter(isNotNullOrUndefined) || [],
        ),
        ...(leg.serviceJourney?.notices || []),
        ...(leg.serviceJourney?.journeyPattern?.notices || []),
        ...(leg.serviceJourney?.journeyPattern?.line?.notices || []),
        ...(leg.fromEstimatedCall?.notices || []),
        ...(leg.toEstimatedCall?.notices || []),
        ...(leg.line?.notices || []),
    ].filter(isNotNullOrUndefined)
    return uniqBy(notices, (notice) => notice.text)
}

function authorityMapper(
    authority?: Authority | null | undefined,
): (Authority & { codeSpace: string }) | null {
    if (!authority) return null
    const codeSpace = authority?.id.split(':')[0]
    if (!authority || !codeSpace) return null

    return {
        id: authority.id,
        name: authority.name,
        codeSpace,
        url: authority.url,
    }
}

export function legMapper(leg: Leg): Leg & { notices: Notice[] } {
    return {
        ...leg,
        authority: authorityMapper(leg.authority),
        notices: getNotices(leg),
    }
}
