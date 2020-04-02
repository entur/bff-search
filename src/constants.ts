import { QueryMode, TransportSubmode } from '@entur/sdk'

export const DEFAULT_QUERY_MODES: QueryMode[] = [
    'air',
    'bus',
    'coach',
    'cableway',
    'foot',
    'funicular',
    'lift',
    'metro',
    'rail',
    'tram',
    'transit',
    'water',
]

export const ALL_BUS_SUBMODES: TransportSubmode[] = [
    'airportLinkBus',
    'railReplacementBus',
    'expressBus',
    'localBus',
    'nightBus',
    'regionalBus',
    'schoolBus',
    'shuttleBus',
    'sightseeingBus',
    'nationalCoach',
]

export const ALL_RAIL_SUBMODES: TransportSubmode[] = [
    'airportLinkRail',
    'touristRailway',
    'international',
    'interregionalRail',
    'local',
    'longDistance',
    'nightRail',
    'regionalRail',
]

export const NON_TRANSIT_DISTANCE_LIMITS = {
    UPPER: {
        bicycle: 100000,
        bicycle_rent: 100000,
        car: 120000,
        foot: 100000,
    },
    LOWER: {
        foot: 1,
        bicycle_rent: 1,
        bicycle: 1,
        car: 1,
    },
}

export const TAXI_LIMITS = {
    DURATION_MAX_HOURS: 4,
    DURATION_MIN_SECONDS: 5 * 60,
    CAR_ALTERNATIVE_MIN_SECONDS: 15 * 60,
    FOOT_ALTERNATIVE_MIN_SECONDS: 20 * 60,
}
