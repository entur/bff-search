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
    addMinutes,
    differenceInMinutes,
} from 'date-fns'

import {
    SearchParams,
    NonTransitTripPatterns,
    GraphqlQuery,
    Metadata,
} from '../types'

import { isValidTransitAlternative } from '../utils/tripPattern'

import { parseLeg } from '../utils/leg'

import { TRANSIT_HOST_OTP2 } from '../config'
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
    modes: Modes
}

interface TransitTripPatterns {
    tripPatterns: Otp2TripPattern[]
    hasFlexibleTripPattern: boolean
    queries: GraphqlQuery[]
    metadata?: Metadata
}

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
): Promise<[Otp2TripPattern[], Metadata | undefined]> {
    const res = await sdk.queryJourneyPlanner<{
        trip: { metadata: Metadata; tripPatterns: any[] }
    }>(JOURNEY_PLANNER_QUERY, getTripPatternsVariables(params))

    const { metadata } = res.trip
    const parse = createParseTripPattern()
    return [
        (res.trip?.tripPatterns || [])
            .map((pattern: any) => ({
                ...pattern,
                legs: pattern.legs.map(legMapper),
            }))
            .map(parse),
        metadata,
    ]
}

function getSearchWindow(
    flexibleTripPattern: Otp2TripPattern,
    searchDate: Date,
): number {
    return Math.max(
        differenceInMinutes(
            parseISO(flexibleTripPattern.expectedStartTime),
            searchDate,
        ),
        60,
    )
}

function mixTripPatterns(
    tripPatterns: Otp2TripPattern[],
    nextDateTime: Date,
    flexibleTripPattern?: Otp2TripPattern,
    searchWindowUsed?: number,
): Otp2TripPattern[] {
    if (!flexibleTripPattern) return tripPatterns

    const searchWindowDateLimit = searchWindowUsed
        ? addMinutes(nextDateTime, searchWindowUsed)
        : undefined

    if (
        tripPatterns.length &&
        searchWindowDateLimit &&
        parseISO(flexibleTripPattern.expectedStartTime) > searchWindowDateLimit
    )
        return tripPatterns

    return [flexibleTripPattern, ...tripPatterns]
}

export async function searchTransit(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
    prevQueries?: GraphqlQuery[],
): Promise<TransitTripPatterns> {
    const { initialSearchDate, searchFilter, ...searchParams } = params

    const filteredModes = filterModesAndSubModes(searchFilter)

    const getTripPatternsParams = {
        ...searchParams,
        modes: filteredModes,
    }
    const [flexibleResults, [response, initialMetadata]] = await Promise.all([
        initialSearchDate === searchParams.searchDate
            ? searchFlexible(params)
            : undefined,
        getTripPatterns(getTripPatternsParams),
    ])

    const flexibleTripPattern = flexibleResults?.tripPatterns?.[0]

    let tripPatterns = response.filter(isValidTransitAlternative)
    let metadata = initialMetadata
    let queries = [
        ...(prevQueries || []),
        ...(flexibleResults?.queries || []),
        getTripPatternsQuery(getTripPatternsParams),
    ]

    const nextDateTime = params.arriveBy
        ? metadata?.prevDateTime
        : metadata?.nextDateTime

    const nextSearchDate = nextDateTime
        ? parseISO(nextDateTime)
        : searchParams.searchDate

    if (flexibleResults && flexibleTripPattern && !tripPatterns.length) {
        // Rekne ut tidsforskjellen i minutt mellom searchDate fram til flexible result [0]

        const searchWindow = getSearchWindow(
            flexibleTripPattern,
            nextSearchDate,
        )

        // Gjere nytt transit-søk med nytt søkevindu
        const nextSearchParams = {
            ...getTripPatternsParams,
            searchDate: nextDateTime,
            searchWindow,
        }
        const [
            transitResultsBeforeFlexible,
            beforeFlexibleMetadata,
        ] = await getTripPatterns(nextSearchParams)

        tripPatterns = transitResultsBeforeFlexible.filter(
            isValidTransitAlternative,
        )
        metadata = beforeFlexibleMetadata
        queries = [...queries, getTripPatternsQuery(nextSearchParams)]
    }

    tripPatterns = mixTripPatterns(
        tripPatterns,
        nextSearchDate,
        flexibleTripPattern,
        metadata?.searchWindowUsed,
    )

    if (!tripPatterns.length && metadata) {
        const nextSearchParams = {
            ...params,
            searchDate: nextSearchDate,
        }
        return searchTransit(nextSearchParams, extraHeaders, queries)
    }

    if (!tripPatterns.length && !metadata) {
        const nextMidnight = params.arriveBy
            ? endOfDay(subDays(searchParams.searchDate, 1))
            : startOfDay(addDays(searchParams.searchDate, 1))

        if (Math.abs(differenceInDays(nextMidnight, initialSearchDate)) < 7) {
            const nextSearchParams = {
                ...params,
                searchDate: nextMidnight,
            }
            return searchTransit(nextSearchParams, extraHeaders, queries)
        }
    }
    // eslint-disable-next-line fp/no-mutating-methods
    tripPatterns = [...tripPatterns].sort((a, b) => {
        const field = searchParams.arriveBy
            ? 'expectedEndTime'
            : 'expectedStartTime'
        return a[field] < b[field] ? -1 : 1
    })

    return {
        tripPatterns,
        metadata,
        hasFlexibleTripPattern: Boolean(flexibleTripPattern),
        queries,
    }
}

export async function searchFlexible(
    params: SearchParams,
): Promise<{
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

    const [tripPatterns] = await getTripPatterns(getTripPatternsParams)

    return {
        tripPatterns,
        queries: [getTripPatternsQuery(getTripPatternsParams)],
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
