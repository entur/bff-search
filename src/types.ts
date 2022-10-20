import { Modes, Location } from './generated/graphql'

import { GetTripPatternsQuery } from './generated/graphql'

export { RoutingError, RoutingErrorCode } from './generated/graphql'

export type TripPattern = GetTripPatternsQuery['trip']['tripPatterns'][0]
export type TripPatternParsed = TripPattern & { id: string }
export type Leg = NonNullable<TripPattern['legs'][0]>
export type EstimatedCall = NonNullable<Leg['fromEstimatedCall']>
export type IntermediateEstimatedCall = NonNullable<
    Leg['intermediateEstimatedCalls'][0]
>
export type Notice = NonNullable<IntermediateEstimatedCall['notices'][0]>
export type Authority = NonNullable<Leg['authority']>
export type Place = NonNullable<Leg['fromPlace']>

/**
 * The params sent by clients.
 */
export interface RawSearchParams {
    from: Location
    to: Location
    arriveBy?: boolean
    searchDate?: Date
    walkSpeed?: number
    minimumTransferTime?: number
    cursor?: string
    searchFilter?: SearchFilter[]
    searchPreset?: SearchPreset
}

interface DevParams {
    debugItineraryFilter?: boolean
    walkReluctance?: number
    waitReluctance?: number
    transferPenalty?: number
}

/**
 * The parsed params for use internally.
 */
export type SearchParams = Omit<RawSearchParams, 'searchFilter'> &
    DevParams & {
        searchDate: Date
        searchWindow?: number
        modes: Modes
        numTripPatterns?: number
    }

export interface CursorData {
    v: number
    params: SearchParams
}

export interface GraphqlQuery {
    query: string
    variables?: Record<string, unknown>
    comment?: string
}

export interface Metadata {
    searchWindowUsed: number
    nextDateTime: string
    prevDateTime: string
}

export interface NonTransitTripPatterns {
    bicycle?: TripPatternParsed
    bicycle_rent?: TripPatternParsed
    car?: TripPatternParsed
    foot?: TripPatternParsed
}

export enum SearchFilter {
    BUS = 'bus',
    COACH = 'coach',
    RAIL = 'rail',
    TRAM = 'tram',
    METRO = 'metro',
    AIR = 'air',
    WATER = 'water',
    CAR_FERRY = 'car_ferry',
    FLYTOG = 'flytog',
    FLYBUSS = 'flybuss',
}

export enum SearchPreset {
    RECOMMENDED = 'RECOMMENDED',
    FASTEST = 'FASTEST',
    AVOID_TRANSFERS = 'AVOID_TRANSFERS',
    AVOID_WALKING = 'AVOID_WALKING',
}
