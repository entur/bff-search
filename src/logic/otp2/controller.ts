import createEnturService, {
    LegMode,
    TripPattern,
    IntermediateEstimatedCall,
    Leg,
    Notice,
    Authority,
    TransportMode,
} from '@entur/sdk'
import { v4 as uuid } from 'uuid'
import {
    addDays,
    differenceInDays,
    endOfDay,
    startOfDay,
    subDays,
    parseISO,
    differenceInMinutes,
} from 'date-fns'

import {
    SearchParams,
    NonTransitTripPatterns,
    GraphqlQuery,
    Metadata,
    RoutingError,
    RoutingErrorCode,
} from '../../types'

import { isValidTransitAlternative } from '../../utils/tripPattern'
import { parseLeg } from '../../utils/leg'
import { replaceQuay1ForOsloSWithUnknown } from '../../utils/osloSTrack1Replacer'

import { TRANSIT_HOST_OTP2 } from '../../config'
import { RoutingErrorsError } from '../../errors'

import JOURNEY_PLANNER_QUERY from './query'
import { filterModesAndSubModes, Mode } from './modes'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: TRANSIT_HOST_OTP2,
    },
})

interface Otp2TripPattern extends TripPattern {
    systemNotices: {
        tag: string
        text: string
    }[]
}

export interface Otp2SearchParams extends Omit<SearchParams, 'modes'> {
    searchWindow?: number
    modes: Modes
}

interface TransitTripPatterns {
    tripPatterns: Otp2TripPattern[]
    hasFlexibleTripPattern?: boolean
    queries: GraphqlQuery[]
    metadata?: Metadata
}

// If any of these routing errors are received, there is no point in continuing the search.
const HOPELESS_ROUTING_ERRORS = [
    RoutingErrorCode.noTransitConnection,
    RoutingErrorCode.outsideServicePeriod,
    RoutingErrorCode.outsideBounds,
    RoutingErrorCode.locationNotFound,
//    RoutingErrorCode.walkingBetterThanTransit,
    RoutingErrorCode.systemError,
]

export function createParseTripPattern(): (
    rawTripPattern: any,
) => Otp2TripPattern {
    let i = 0
    const sharedId = uuid()
    const baseId = sharedId.substring(0, 23)
    const iterator = parseInt(sharedId.substring(24), 16)

    return (rawTripPattern: any) => {
        i++
        const id = `${baseId}-${(iterator + i).toString(16).slice(-12)}`
        return parseTripPattern({ id, ...rawTripPattern })
    }
}

function parseTripPattern(rawTripPattern: any): Otp2TripPattern {
    return {
        ...rawTripPattern,
        id: rawTripPattern.id || uuid(),
        legs: rawTripPattern.legs.map(parseLeg),
        genId: `${new Date().getTime()}:${Math.random()
            .toString(36)
            .slice(2, 12)}`,
    }
}

type StreetMode =
    | 'foot'
    | 'bicycle'
    | 'bike_park'
    | 'bike_rental'
    | 'car'
    | 'car_park'
    | 'taxi'
    | 'car_rental'

interface Modes {
    accessMode: StreetMode
    egressMode: StreetMode
    directMode?: StreetMode
    transportModes: Mode[]
}

const DEFAULT_MODES: Modes = {
    accessMode: 'foot',
    egressMode: 'foot',
    transportModes: [
        { transportMode: TransportMode.BUS },
        { transportMode: TransportMode.TRAM },
        { transportMode: TransportMode.RAIL },
        { transportMode: TransportMode.METRO },
        { transportMode: TransportMode.WATER },
        { transportMode: TransportMode.AIR },
    ],
}

function getTripPatternsVariables(params: any): any {
    const {
        from,
        to,
        searchDate = new Date(),
        arriveBy = false,
        modes = DEFAULT_MODES,
        wheelchairAccessible = false,
        ...rest
    } = params || {}

    return {
        ...rest,
        from,
        to,
        dateTime: searchDate.toISOString(),
        arriveBy,
        modes,
        wheelchairAccessible,
    }
}

function getTripPatternsQuery(params: Record<string, unknown>): GraphqlQuery {
    return {
        query: JOURNEY_PLANNER_QUERY,
        variables: getTripPatternsVariables(params),
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
        .map(({ notices }) => notices || [])
        .reduce((a, b) => [...a, ...b], [])
}

function getNotices(leg: Leg): Notice[] {
    const notices = [
        ...getNoticesFromIntermediateEstimatedCalls(
            leg.intermediateEstimatedCalls,
        ),
        ...(leg.serviceJourney?.notices || []),
        ...(leg.serviceJourney?.journeyPattern?.notices || []),
        ...(leg.serviceJourney?.journeyPattern?.line?.notices || []),
        ...(leg.fromEstimatedCall?.notices || []),
        ...(leg.toEstimatedCall?.notices || []),
        ...(leg.line?.notices || []),
    ]
    return uniqBy(notices, (notice) => notice.text)
}

function authorityMapper(authority?: Authority): Authority | undefined {
    if (!authority) return undefined

    return {
        id: authority.id,
        name: authority.name,
        codeSpace: authority.id.split(':')[0],
        url: authority.url,
    }
}

export function legMapper(leg: Leg): Leg {
    return {
        ...leg,
        authority: authorityMapper(leg.authority),
        notices: getNotices(leg),
    }
}

async function getTripPatterns(
    params: any,
): Promise<[Otp2TripPattern[], Metadata | undefined, RoutingError[]]> {
    const res = await sdk.queryJourneyPlanner<{
        trip: {
            metadata: Metadata
            tripPatterns: any[]
            routingErrors: RoutingError[]
        }
    }>(JOURNEY_PLANNER_QUERY, getTripPatternsVariables(params))

    const { metadata, routingErrors } = res.trip

    if (
        routingErrors.some(({ code }) => HOPELESS_ROUTING_ERRORS.includes(code))
    ) {
        throw new RoutingErrorsError(routingErrors, [
            getTripPatternsQuery(params),
        ])
    }

    const parse = createParseTripPattern()
    return [
        (res.trip?.tripPatterns || [])
            .map((pattern: any) => ({
                ...pattern,
                legs: pattern.legs.map(legMapper),
            }))
            .map(parse),
        metadata,
        routingErrors,
    ]
}

function getMinutesBetweenDates(
    a: Date,
    b: Date,
    limits?: { min: number; max?: number },
): number {
    const min = limits?.min || 0
    const max = limits?.max || Infinity
    const diff = Math.abs(differenceInMinutes(a, b))
    return Math.max(min, Math.min(max, diff))
}

function sortTripPatternsByExpectedTime(
    tripPatterns: Otp2TripPattern[],
    arriveBy: boolean,
): Otp2TripPattern[] {
    // eslint-disable-next-line fp/no-mutating-methods
    return tripPatterns.sort((a, b) => {
        if (arriveBy) return a.expectedEndTime > b.expectedEndTime ? -1 : 1
        return a.expectedStartTime < b.expectedStartTime ? -1 : 1
    })
}

function getNextSearchDateFromMetadata(
    metadata: Metadata,
    arriveBy = false,
): Date {
    const dateTime = arriveBy ? metadata.prevDateTime : metadata.nextDateTime
    return parseISO(dateTime)
}

function combineAndSortFlexibleAndTransitTripPatterns(
    tripPatterns: Otp2TripPattern[],
    nextDateTime?: Date,
    flexibleTripPattern?: Otp2TripPattern,
    arriveBy = false,
): Otp2TripPattern[] {
    if (!flexibleTripPattern) return tripPatterns

    const sortedTripPatterns = sortTripPatternsByExpectedTime(
        [flexibleTripPattern, ...tripPatterns],
        arriveBy,
    )

    if (!nextDateTime) {
        return sortedTripPatterns
    }

    const flexIsOutsideTransitSearchWindowUsed = arriveBy
        ? parseISO(flexibleTripPattern.expectedEndTime) < nextDateTime
        : parseISO(flexibleTripPattern.expectedStartTime) > nextDateTime

    if (flexIsOutsideTransitSearchWindowUsed) {
        return tripPatterns
    }

    return sortedTripPatterns
}

export async function searchTransit(
    params: Otp2SearchParams,
    extraHeaders: { [key: string]: string },
    prevQueries?: GraphqlQuery[],
    options?: { enableTaxiSearch?: boolean },
): Promise<TransitTripPatterns> {
    const { initialSearchDate, searchFilter, ...searchParams } = params
    const { searchDate, arriveBy } = searchParams
    const filteredModes = filterModesAndSubModes(searchFilter)

    const getTripPatternsParams = {
        ...searchParams,
        modes: filteredModes,
    }

    const [flexibleResults, [response, initialMetadata, routingErrors]] =
        await Promise.all([
            initialSearchDate === searchDate
                ? searchFlexible(params)
                : undefined,
            getTripPatterns(getTripPatternsParams),
        ])

    let taxiResults: TransitTripPatterns | undefined

    const noStopsInRangeErrors = routingErrors.filter(
        ({ code }) => code === RoutingErrorCode.noStopsInRange,
    )

    if (
        options?.enableTaxiSearch &&
        initialSearchDate === searchDate &&
        noStopsInRangeErrors.length > 0
    ) {
        taxiResults = await searchTaxiFrontBack(params, {
            access: noStopsInRangeErrors.some((e) => e.inputField === 'from'),
            egress: noStopsInRangeErrors.some((e) => e.inputField === 'to'),
        })
    }

    const flexibleTripPattern = flexibleResults?.tripPatterns?.[0]

    let tripPatterns = response
        .filter(isValidTransitAlternative)
        // No, this hack doesn't feel good. But we get wrong data from the backend and
        // customers keep getting stuck on the wrong platform (31st of May 2021)
        .map(replaceQuay1ForOsloSWithUnknown)

    let metadata = initialMetadata
    let queries = [
        ...(prevQueries || []),
        ...(flexibleResults?.queries || []),
        ...(taxiResults?.queries || []),
        getTripPatternsQuery(getTripPatternsParams),
    ]

    const nextSearchDateFromMetadata = metadata
        ? getNextSearchDateFromMetadata(metadata, arriveBy)
        : undefined

    if (flexibleResults && flexibleTripPattern && !tripPatterns.length) {
        const transitSearchDate = nextSearchDateFromMetadata || searchDate

        const searchWindow = getMinutesBetweenDates(
            parseISO(
                arriveBy
                    ? flexibleTripPattern.expectedEndTime
                    : flexibleTripPattern.expectedStartTime,
            ),
            transitSearchDate,
            { min: 60 },
        )

        const nextSearchParams = {
            ...getTripPatternsParams,
            searchDate: transitSearchDate,
            searchWindow,
        }

        const [transitResultsBeforeFlexible, beforeFlexibleMetadata] =
            await getTripPatterns(nextSearchParams)

        tripPatterns = transitResultsBeforeFlexible.filter(
            isValidTransitAlternative,
        )
        metadata = beforeFlexibleMetadata
        queries = [...queries, getTripPatternsQuery(nextSearchParams)]
    }

    tripPatterns = [
        ...(taxiResults?.tripPatterns || []),
        ...combineAndSortFlexibleAndTransitTripPatterns(
            tripPatterns,
            nextSearchDateFromMetadata,
            flexibleTripPattern,
            arriveBy,
        ),
    ]

    if (!tripPatterns.length && metadata) {
        if (queries.length > 15) {
            return {
                tripPatterns: [],
                metadata: undefined,
                hasFlexibleTripPattern: false,
                queries,
            }
        }

        const dateTime = arriveBy
            ? metadata.prevDateTime
            : metadata.nextDateTime

        const nextSearchParams: Otp2SearchParams = {
            ...params,
            searchWindow: metadata.searchWindowUsed,
            searchDate: parseISO(dateTime),
        }
        return searchTransit(nextSearchParams, extraHeaders, queries)
    }

    if (!tripPatterns.length && !metadata) {
        const nextMidnight = arriveBy
            ? endOfDay(subDays(searchDate, 1))
            : startOfDay(addDays(searchDate, 1))

        if (Math.abs(differenceInDays(nextMidnight, initialSearchDate)) < 7) {
            const nextSearchParams = {
                ...params,
                searchDate: nextMidnight,
            }
            return searchTransit(nextSearchParams, extraHeaders, queries)
        }
    }

    return {
        tripPatterns,
        metadata,
        hasFlexibleTripPattern: Boolean(flexibleTripPattern),
        queries,
    }
}

async function searchFlexible(params: Otp2SearchParams): Promise<{
    tripPatterns: Otp2TripPattern[]
    queries: GraphqlQuery[]
}> {
    const { initialSearchDate, searchFilter, ...searchParams } = params

    const getTripPatternsParams = {
        ...searchParams,
        modes: {
            directMode: 'flexible',
        },
        numTripPatterns: 1,
    }

    const [returnedTripPatterns] = await getTripPatterns(getTripPatternsParams)
    const queries = [getTripPatternsQuery(getTripPatternsParams)]

    const tripPatterns = returnedTripPatterns.filter(({ legs }) => {
        const isFootOnly = legs.length === 1 && legs[0].mode === LegMode.FOOT
        return !isFootOnly
    })

    return {
        tripPatterns,
        queries,
    }
}

async function searchTaxiFrontBack(
    params: Otp2SearchParams,
    options?: { access: boolean; egress: boolean },
): Promise<TransitTripPatterns> {
    const { initialSearchDate, searchFilter, ...searchParams } = params

    const { access, egress } = {
        access: true,
        egress: true,
        ...options,
    }

    const getTripPatternsParams = {
        ...searchParams,
        modes: {
            ...DEFAULT_MODES,
            accessMode: access ? 'car_pickup' : 'foot',
            egressMode: egress ? 'car_pickup' : 'foot',
        },
        numTripPatterns: egress && access ? 2 : 1,
    }

    const [tripPatterns] = await getTripPatterns(getTripPatternsParams)
    const queries = [getTripPatternsQuery(getTripPatternsParams)]

    /**
     * If no access or egress leg is necessary, we can get trip patterns with
     * no car legs. We therefore filter the results to prevent it from
     * returning results that the normal search also might return.
     */
    const taxiResults = tripPatterns.filter(({ legs }) =>
        legs.some(({ mode }) => mode === LegMode.CAR),
    )

    return {
        tripPatterns: taxiResults,
        queries,
    }
}

export type NonTransitMode = 'foot' | 'bicycle' | 'car' | 'bike_rental'

export async function searchNonTransit(
    params: SearchParams,
    modes: NonTransitMode[] = [
        LegMode.FOOT,
        LegMode.BICYCLE,
        LegMode.CAR,
        'bike_rental',
    ],
): Promise<{
    tripPatterns: NonTransitTripPatterns
    queries: { [key in NonTransitMode]?: GraphqlQuery }
}> {
    const results = await Promise.all(
        modes.map(async (mode) => {
            const getTripPatternsParams = {
                ...params,
                limit: 1,
                allowBikeRental: mode === 'bike_rental',
                modes: {
                    accessMode: null,
                    egressMode: null,
                    directMode: mode,
                    transportModes: [],
                },
            }

            const [result] = await getTripPatterns(getTripPatternsParams)
            const query = getTripPatternsQuery(getTripPatternsParams)

            const tripPattern = result[0]

            return { mode, tripPattern, query }
        }),
    )

    return results.reduce(
        (acc, { mode, tripPattern, query }) => {
            const m = mode === 'bike_rental' ? 'bicycle_rent' : mode
            return {
                tripPatterns: {
                    ...acc.tripPatterns,
                    [m]: tripPattern,
                },
                queries: {
                    ...acc.queries,
                    [m]: query,
                },
            }
        },
        {
            tripPatterns: {},
            queries: {},
        },
    )
}
