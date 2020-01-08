import {
  GetTripPatternsParams, TripPattern, Location,
} from '@entur/sdk'

export type SearchParams = {
  cursor?: string,
  from: Location,
  to: Location,
} & GetTripPatternsParams

export interface NonTransitTripPatterns {
  bicycle: TripPattern | null,
  car: TripPattern | null,
  foot: TripPattern | null,
}
