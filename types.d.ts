import {
  GetTripPatternsParams, TripPattern, Location,
} from '@entur/sdk'

export type CursorData = {
  v: number,
  params: SearchParams,
}

export type SearchParams = {
  from: Location,
  to: Location,
  cursor?: string,
  initialSearchDate?: string,
} & GetTripPatternsParams

export interface NonTransitTripPatterns {
  bicycle: TripPattern | null,
  car: TripPattern | null,
  foot: TripPattern | null,
}
