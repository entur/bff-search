import {
    GetTripPatternsParams,
    TripPattern,
    QueryMode,
    TransportSubmodeParam,
    InputBanned,
    InputWhiteListed,
} from '@entur/sdk'

export type RawSearchParams = GetTripPatternsParams & {
    cursor?: string
    searchFilter?: SearchFilter[]
}

export type SearchParams = RawSearchParams & {
    searchDate: Date
    initialSearchDate: Date
}

export interface CursorData {
    v: number
    params: SearchParams
}

export interface SearchResults {
    transitTripPatterns: TransitTripPatterns
    nonTransitTripPatterns: NonTransitTripPatterns
}

export interface GraphqlQuery {
    query: string
    variables?: Record<string, unknown>
}

export interface Metadata {
    searchWindowUsed: number
    nextDateTime: string
    prevDateTime: string
}

export interface TransitTripPatterns {
    tripPatterns: TripPattern[]
    hasFlexibleTripPattern: boolean
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
    RAIL = 'rail',
    TRAM = 'tram',
    METRO = 'metro',
    AIR = 'air',
    WATER = 'water',
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
