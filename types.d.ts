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
    searchFilter?: SearchFilterType[]
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
    variables?: object
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

export type SearchFilterType = 'bus' | 'rail' | 'tram' | 'metro' | 'air' | 'water' | 'flytog' | 'flybuss'
