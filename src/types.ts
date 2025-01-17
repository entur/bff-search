import {
    Modes,
    Location,
    EstimatedCallFieldsFragment,
    NoticeFieldsFragment,
    AuthorityFieldsFragment,
    PlaceFieldsFragment,
    LegFieldsFragment,
    ReportType,
    MultilingualString,
    ValidityPeriod,
    InfoLink,
} from './generated/graphql'

import { GetTripPatternsQuery } from './generated/graphql'

export { RoutingError, RoutingErrorCode } from './generated/graphql'

export interface ExtraHeaders {
    [key: string]: string
}

export type TripPattern = GetTripPatternsQuery['trip']['tripPatterns'][0]
export type TripPatternParsed = TripPattern & { id: string }
export type Leg = LegFieldsFragment
export type EstimatedCall = EstimatedCallFieldsFragment
export type Notice = NoticeFieldsFragment
export type Authority = AuthorityFieldsFragment
export type Place = PlaceFieldsFragment

/**
 * The params sent by clients.
 */
export interface RawSearchParams {
    from: Location
    passThroughPoint?: PassThroughPoint
    to: Location
    arriveBy?: boolean
    searchDate?: string
    walkSpeed?: number
    minimumTransferTime?: number
    pageCursor?: string
    searchFilter?: SearchFilter[]
    searchPreset?: SearchPreset
    allowFlexible?: boolean
    includeCancellations?: boolean
}

interface DevParams {
    debugItineraryFilter?: boolean
}

/**
 * The parsed params for use internally.
 */
export type SearchParams = Omit<
    RawSearchParams,
    'searchFilter' | 'searchDate'
> &
    DevParams & {
        searchDate: Date
        searchWindow?: number
        modes: Modes
        numTripPatterns?: number
        pageCursor?: string
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
    TAXI = 'taxi',
}

export enum SearchPreset {
    RECOMMENDED = 'RECOMMENDED',
    FASTEST = 'FASTEST',
    AVOID_TRANSFERS = 'AVOID_TRANSFERS',
    AVOID_WALKING = 'AVOID_WALKING',
}

export interface SituationResponse {
    situationNumber: string
    reportType: ReportType
    summary: MultilingualString[]
    description: MultilingualString[]
    advice: MultilingualString[]
    validityPeriod: ValidityPeriod | undefined
    infoLinks: InfoLink[] | undefined
    affects: Affected[]
}

export type Affected =
    | { __type: 'AffectedLine'; line: { id: string } }
    | { __type: 'AffectedServiceJourney'; serviceJourney: { id: string } }
    | { __type: 'AffectedStopPlace'; stopPlace: { id: string; name: string } }
    | { __type: 'AffectedQuay'; quay: { id: string; name: string } }
    | { __type: 'AffectedUnknown' }

interface PassThroughPoint {
    name: string
    place: string
}
