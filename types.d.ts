import {
    GetTripPatternsParams, TripPattern, QueryMode, TransportSubmodeParam, InputBanned, InputWhiteListed,
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

export interface TransitTripPatterns {
    tripPatterns: TripPattern[]
    hasFlexibleTripPattern: boolean
    isSameDaySearch: boolean
}

export interface NonTransitTripPatterns {
    bicycle?: TripPattern
    car?: TripPattern
    foot?: TripPattern
}

export interface FilteredModesAndSubModes {
    filteredModes: QueryMode[]
    subModesFilter: TransportSubmodeParam[]
    banned?: InputBanned
    whiteListed?: InputWhiteListed
}

export type SearchFilterType =
    | 'bus'
    | 'rail'
    | 'tram'
    | 'metro'
    | 'air'
    | 'water'
    | 'flytog'
    | 'flybuss'
