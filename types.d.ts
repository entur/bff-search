import {
  GetTripPatternsParams, TripPattern, Location, QueryMode,
} from '@entur/sdk'

export type CursorData = {
  v: number,
  params: SearchParams,
}

export type RawSearchParams = GetTripPatternsParams & {
    cursor?: string,
}

export type SearchParams = RawSearchParams & {
    searchDate: Date,
    initialSearchDate: Date,
    modes: QueryMode[],
    skipTaxi?: boolean,
}

export type SearchResults = {
  transitTripPatterns: TransitTripPatterns,
  nonTransitTripPatterns: NonTransitTripPatterns,
}

export interface TransitTripPatterns {
  tripPatterns: TripPattern[],
  hasFlexibleTripPattern: boolean,
  isSameDaySearch: boolean,
}

export interface NonTransitTripPatterns {
  bicycle?: TripPattern,
  car?: TripPattern,
  foot?: TripPattern,
}
