import {
    TripPattern,
    QueryMode,
    TransportSubmodeParam,
    InputBanned,
    InputWhiteListed,
    Location,
} from '@entur/sdk'

import { Modes } from '@entur/sdk/lib/journeyPlanner/types'

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
}

/**
 * The parsed params for use internally.
 */
export type SearchParams = RawSearchParams & {
    initialSearchDate: Date
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

export interface TransitTripPatterns {
    tripPatterns: TripPattern[]
    // TODO 7/12-21: Only used by OTP1, and no client uses it anymore. Can be removed once OTP1 is removed
    hasFlexibleTripPattern?: boolean
    queries: GraphqlQuery[]
    metadata?: Metadata
    nextSearchParams?: SearchParams
}

export interface NonTransitTripPatterns {
    bicycle?: TripPattern
    bicycle_rent?: TripPattern
    car?: TripPattern
    foot?: TripPattern
}

export interface FilteredModesAndSubModes {
    filteredModes: QueryMode[]
    subModesFilter: TransportSubmodeParam[]
    banned?: InputBanned
    whiteListed?: InputWhiteListed
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

export enum Platform {
    WEB = 'web',
    APP = 'app',
    WIDGET = 'widget',
}

export enum RoutingErrorCode {
    // No transit connection was found between the origin and destination withing the operating day or the next day
    noTransitConnection = 'noTransitConnection',

    // Transit connection was found, but it was outside the search window, see metadata for the next search window
    noTransitConnectionInSearchWindow = 'noTransitConnectionInSearchWindow',

    // The date specified is outside the range of data currently loaded into the system
    outsideServicePeriod = 'outsideServicePeriod',

    // The coordinates are outside the bounds of the data currently loaded into the system
    outsideBounds = 'outsideBounds',

    // The specified location is not close to any streets or transit stops
    locationNotFound = 'locationNotFound',

    // No stops are reachable from the location specified. You can try searching using a different access or egress mode
    noStopsInRange = 'noStopsInRange',

    // The origin and destination are so close to each other, that walking is always better, but no direct mode was specified for the search
    walkingBetterThanTransit = 'walkingBetterThanTransit',

    // An unknown error happened during the search. The details have been logged to the server logs
    systemError = 'systemError',
}

export interface RoutingError {
    code: RoutingErrorCode
    inputField?: 'dateTime' | 'from' | 'to'
    description: string
}
