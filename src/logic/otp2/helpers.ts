import { differenceInMinutes } from 'date-fns'
import cleanDeep from 'clean-deep'
import { v4 as uuid } from 'uuid'

import {
    Authority,
    EstimatedCall,
    GraphqlQuery,
    Leg,
    Notice,
    SearchParams,
    SearchPreset,
    TripPattern,
    TripPatternParsed,
} from '../../types'
import {
    GetTripPatternsQueryVariables,
    ItineraryFilterDebugProfile,
} from '../../generated/graphql'
import { parseLeg } from '../../utils/leg'
import { isNotNullOrUndefined } from '../../utils/misc'

import JOURNEY_PLANNER_QUERY from './queries/getTripPatterns.query'

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
    searchPreset,
    pageCursor,
    passThroughPoint,
    // DevParams
    debugItineraryFilter,
    walkReluctance: debugWalkReluctance,
    waitReluctance: debugWaitReluctance,
    transferPenalty: debugTransferPenalty,
}: SearchParams): GetTripPatternsQueryVariables {
    const { transferPenalty, transferSlack, walkReluctance, waitReluctance } =
        getSearchPresetVariables(searchPreset, minimumTransferTime)

    return {
        numTripPatterns,
        from,
        to,
        dateTime: searchDate.toISOString(),
        arriveBy: Boolean(arriveBy),
        wheelchairAccessible: false,
        modes,
        walkSpeed,
        banned: undefined,
        whiteListed: undefined,
        transferSlack,
        walkReluctance: debugWalkReluctance || walkReluctance,
        waitReluctance: debugWaitReluctance || waitReluctance,
        transferPenalty: debugTransferPenalty || transferPenalty,
        searchWindow: searchWindow || undefined,
        debugItineraryFilter:
            debugItineraryFilter === true
                ? ItineraryFilterDebugProfile.LimitToSearchWindow
                : ItineraryFilterDebugProfile.Off,
        pageCursor,
        passThroughPoints: passThroughPoint
            ? {
                  name: passThroughPoint.name,
                  placeIds: [passThroughPoint.place],
              }
            : undefined,
    }
}

interface PresetValues {
    transferPenalty?: number
    transferSlack?: number
    walkReluctance?: number
    waitReluctance?: number
    searchWindow?: number
}

function getSearchPresetVariables(
    searchPreset: SearchPreset = SearchPreset.RECOMMENDED,
    minimumTransferTime?: number,
): PresetValues {
    switch (searchPreset) {
        case SearchPreset.RECOMMENDED:
            return {
                transferPenalty: undefined,
                transferSlack: minimumTransferTime,
                walkReluctance: undefined,
                waitReluctance: undefined,
            }
        case SearchPreset.FASTEST:
            return {
                transferPenalty: 0,
                transferSlack: 0,
                walkReluctance: 1,
                waitReluctance: 1,
            }
        case SearchPreset.AVOID_TRANSFERS:
            return {
                transferPenalty: 1200,
                transferSlack: minimumTransferTime,
                walkReluctance: 2,
                waitReluctance: 1,
            }
        case SearchPreset.AVOID_WALKING:
            return {
                transferPenalty: 0,
                transferSlack: minimumTransferTime,
                walkReluctance: 10,
                waitReluctance: 1,
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

export function combineAndSortFlexibleAndTransitTripPatterns(
    regularTripPatterns: TripPatternParsed[],
    flexibleTripPattern?: TripPatternParsed,
    arriveBy = false,
): TripPatternParsed[] {
    if (!flexibleTripPattern) return regularTripPatterns

    const sortedTripPatterns = sortTripPatternsByExpectedTime(
        [flexibleTripPattern, ...regularTripPatterns],
        arriveBy,
    )

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
    estimatedCalls: EstimatedCall[],
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
