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
