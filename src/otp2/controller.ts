import createEnturService, {
    LegMode,
    TripPattern,
    IntermediateEstimatedCall,
    Leg,
    Notice,
    Authority,
    TransportMode,
} from '@entur/sdk'
import { differenceInHours } from 'date-fns'

import { SearchParams, NonTransitTripPatterns, GraphqlQuery } from '../../types'

import { isFlexibleAlternative, isValidTransitAlternative } from '../utils/tripPattern'

import { parseLeg } from '../utils/leg'
import { isTransportMode } from '../utils/modes'
import JOURNEY_PLANNER_QUERY from './query'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: process.env.TRANSIT_HOST_OTP2,
    },
})

interface Otp2TripPattern extends TripPattern {
    systemNotices: {
        tag: string
        text: string
    }[]
}

interface TransitTripPatterns {
    tripPatterns: Otp2TripPattern[]
    hasFlexibleTripPattern: boolean
    queries: GraphqlQuery[]
}

function parseTripPattern(rawTripPattern: any): Otp2TripPattern {
    return {
        ...rawTripPattern,
        legs: rawTripPattern.legs.map(parseLeg),
        genId: `${new Date().getTime()}:${Math.random().toString(36).slice(2, 12)}`,
    }
}

type StreetMode = 'foot' | 'bicycle' | 'bike_park' | 'bike_rental' | 'car' | 'car_park' | 'taxi' | 'car_rental'

interface Modes {
    accessMode: StreetMode
    egressMode: StreetMode
    directMode?: StreetMode
    transportMode: TransportMode[]
}

const DEFAULT_MODES: Modes = {
    accessMode: 'foot',
    egressMode: 'foot',
    transportMode: ['bus', 'tram', 'rail', 'metro', 'water', 'air'],
}

function getTripPatternsVariables(params: any): any {
    const {
        from,
        to,
        searchDate = new Date(),
        arriveBy = false,
        modes = DEFAULT_MODES,
        transportSubmodes = [],
        wheelchairAccessible = false,
        limit = 5,
        ...rest
    } = params || {}

    return {
        ...rest,
        from,
        to,
        dateTime: searchDate.toISOString(),
        arriveBy,
        modes,
        transportSubmodes,
        wheelchair: wheelchairAccessible,
        numTripPatterns: limit,
    }
}

function getTripPatternsQuery(params: object): GraphqlQuery {
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

function getNoticesFromIntermediateEstimatedCalls(estimatedCalls: IntermediateEstimatedCall[]): Notice[] {
    if (!estimatedCalls?.length) return []
    return estimatedCalls.map(({ notices }) => notices || []).reduce((a, b) => [...a, ...b], [])
}

function getNotices(leg: Leg): Notice[] {
    const notices = [
        ...getNoticesFromIntermediateEstimatedCalls(leg.intermediateEstimatedCalls),
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

export interface Metadata {
    searchWindowUsed: number
    nextDateTime: string
    prevDateTime: string
}

async function getTripPatterns(params: any): Promise<[Otp2TripPattern[], Metadata | undefined]> {
    const res = await sdk.queryJourneyPlanner<{
        trip: { metadata: Metadata; tripPatterns: any[] }
    }>(JOURNEY_PLANNER_QUERY, getTripPatternsVariables(params))

    const { metadata } = res.trip

    return [
        (res.trip?.tripPatterns || []).map((pattern: any) => ({
            ...pattern,
            legs: pattern.legs.map(legMapper),
        })),
        metadata,
    ]
}

export async function searchTransit(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
    prevQueries?: GraphqlQuery[],
): Promise<TransitTripPatterns & { metadata?: Metadata }> {
    const { initialSearchDate, searchFilter, ...searchParams } = params
    const { searchDate } = searchParams

    const getTripPatternsParams = {
        ...searchParams,
        useFlex: true,
        maxPreTransitWalkDistance: 2000,
        modes: {
            accessMode: 'foot',
            egressMode: 'foot',
            transportMode: (searchParams?.modes || []).filter(isTransportMode),
        },
    }

    const [response, metadata] = await getTripPatterns(getTripPatternsParams)

    const query = getTripPatternsQuery(getTripPatternsParams)
    const queries = [...(prevQueries || []), query]

    const tripPatterns = response.map(parseTripPattern).filter(isValidTransitAlternative)

    const searchTimeWithinRange = differenceInHours(searchDate, initialSearchDate) < 12

    if (!tripPatterns.length && searchTimeWithinRange && metadata) {
        const nextSearchParams = { ...params, searchDate: new Date(metadata.nextDateTime) }
        return searchTransit(nextSearchParams, extraHeaders, queries)
    }

    return {
        tripPatterns,
        metadata,
        hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
        queries,
    }
}

export type NonTransitMode = 'foot' | 'bicycle' | 'car' | 'bike_rental'

export async function searchNonTransit(
    params: SearchParams,
    modes: NonTransitMode[] = [LegMode.FOOT, LegMode.BICYCLE, LegMode.CAR, 'bike_rental'],
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
                    transportMode: [],
                },
            }

            const [result] = await getTripPatterns(getTripPatternsParams)
            const query = getTripPatternsQuery(getTripPatternsParams)

            const candidate = result[0]

            const tripPattern = candidate && parseTripPattern(candidate)

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