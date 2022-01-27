import { TransportSubmode } from '@entur/sdk/lib/journeyPlanner/types'

export const ALL_BUS_SUBMODES: TransportSubmode[] = [
    TransportSubmode.AirportLinkBus,
    TransportSubmode.RailReplacementBus,
    TransportSubmode.ExpressBus,
    TransportSubmode.LocalBus,
    TransportSubmode.NightBus,
    TransportSubmode.RegionalBus,
    TransportSubmode.SchoolBus,
    TransportSubmode.ShuttleBus,
    TransportSubmode.SightseeingBus,
    TransportSubmode.NationalCoach,
]

export const ALL_RAIL_SUBMODES: TransportSubmode[] = [
    TransportSubmode.AirportLinkRail,
    TransportSubmode.TouristRailway,
    TransportSubmode.International,
    TransportSubmode.InterregionalRail,
    TransportSubmode.Local,
    TransportSubmode.LongDistance,
    TransportSubmode.NightRail,
    TransportSubmode.RegionalRail,
]

export const ALL_WATER_SUBMODES: TransportSubmode[] = [
    TransportSubmode.InternationalCarFerry,
    TransportSubmode.LocalCarFerry,
    TransportSubmode.NationalCarFerry,
    TransportSubmode.RegionalCarFerry,
    TransportSubmode.LocalPassengerFerry,
    TransportSubmode.InternationalCarFerry,
]

export const ALL_CAR_FERRY_SUBMODES: TransportSubmode[] = [
    TransportSubmode.InternationalCarFerry,
    TransportSubmode.LocalCarFerry,
    TransportSubmode.NationalCarFerry,
    TransportSubmode.RegionalCarFerry,
]

export const TAXI_LIMITS = {
    DURATION_MAX_HOURS: 4,
    DURATION_MIN_SECONDS: 5 * 60,
}
