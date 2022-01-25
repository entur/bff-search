import { QueryMode, TransportSubmode } from '@entur/sdk'

export const DEFAULT_QUERY_MODES: QueryMode[] = [
    QueryMode.AIR,
    QueryMode.BUS,
    QueryMode.COACH,
    QueryMode.CABLEWAY,
    QueryMode.FOOT,
    QueryMode.FUNICULAR,
    QueryMode.LIFT,
    QueryMode.METRO,
    QueryMode.RAIL,
    QueryMode.TRAM,
    QueryMode.TRANSIT,
    QueryMode.WATER,
]

export const ALL_BUS_SUBMODES: TransportSubmode[] = [
    TransportSubmode.AIRPORT_LINK_BUS,
    TransportSubmode.RAIL_REPLACEMENT_BUS,
    TransportSubmode.EXPRESS_BUS,
    TransportSubmode.LOCAL_BUS,
    TransportSubmode.NIGHT_BUS,
    TransportSubmode.REGIONAL_BUS,
    TransportSubmode.SCHOOL_BUS,
    TransportSubmode.SHUTTLE_BUS,
    TransportSubmode.SIGHTSEEING_BUS,
    TransportSubmode.NATIONAL_COACH,
]

export const ALL_RAIL_SUBMODES: TransportSubmode[] = [
    TransportSubmode.AIRPORT_LINK_RAIL,
    TransportSubmode.TOURIST_RAILWAY,
    TransportSubmode.INTERNATIONAL,
    TransportSubmode.INTERREGIONAL_RAIL,
    TransportSubmode.LOCAL,
    TransportSubmode.LONG_DISTANCE,
    TransportSubmode.NIGHT_RAIL,
    TransportSubmode.REGIONAL_RAIL,
]

export const ALL_WATER_SUBMODES: TransportSubmode[] = [
    TransportSubmode.INTERNATIONAL_CAR_FERRY,
    TransportSubmode.LOCAL_CAR_FERRY,
    TransportSubmode.NATIONAL_CAR_FERRY,
    TransportSubmode.REGIONAL_CAR_FERRY,
    TransportSubmode.LOCAL_PASSENGER_FERRY,
    TransportSubmode.INTERNATIONAL_PASSENGER_FERRY,
]

export const ALL_CAR_FERRY_SUBMODES: TransportSubmode[] = [
    TransportSubmode.INTERNATIONAL_CAR_FERRY,
    TransportSubmode.LOCAL_CAR_FERRY,
    TransportSubmode.NATIONAL_CAR_FERRY,
    TransportSubmode.REGIONAL_CAR_FERRY,
]

export const TAXI_LIMITS = {
    DURATION_MAX_HOURS: 4,
    DURATION_MIN_SECONDS: 5 * 60,
}
