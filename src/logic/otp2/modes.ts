import { TransportMode, TransportSubmode } from '@entur/sdk'
import { uniq } from '../../utils/array'
import { SearchFilter } from '../../types'
import { ALL_BUS_SUBMODES, ALL_RAIL_SUBMODES } from '../../constants'

export type StreetMode =
    | 'foot'
    | 'bicycle'
    | 'bike_park'
    | 'bike_rental'
    | 'car'
    | 'car_park'
    | 'taxi'
    | 'car_rental'
    | 'car_pickup'
    | 'flexible'

export interface Mode {
    transportMode: TransportMode
    transportSubModes?: TransportSubmode[]
}

export interface Modes {
    accessMode?: StreetMode
    egressMode?: StreetMode
    directMode?: StreetMode
    transportModes: Mode[]
}

export const DEFAULT_MODES: Modes = {
    accessMode: 'foot',
    egressMode: 'foot',
    transportModes: [
        { transportMode: TransportMode.BUS },
        { transportMode: TransportMode.TRAM },
        { transportMode: TransportMode.RAIL },
        { transportMode: TransportMode.METRO },
        { transportMode: TransportMode.WATER },
        { transportMode: TransportMode.AIR },
        { transportMode: TransportMode.LIFT },
    ],
}

export function isTransportMode(mode: string): mode is TransportMode {
    return (
        mode === 'air' ||
        mode === 'bus' ||
        mode === 'cableway' ||
        mode === 'water' ||
        mode === 'funicular' ||
        mode === 'lift' ||
        mode === 'rail' ||
        mode === 'metro' ||
        mode === 'tram' ||
        mode === 'coach' ||
        mode === 'unknown'
    )
}

function queryTransportModesReducer(
    transportModes: TransportMode[],
    mode: SearchFilter,
): TransportMode[] {
    return isTransportMode(mode)
        ? [...transportModes, mode as TransportMode]
        : transportModes
}

function convertSearchFiltersToMode(
    searchFilters: SearchFilter[],
): TransportMode[] {
    const initialModes: TransportMode[] = searchFilters.includes(
        SearchFilter.BUS,
    )
        ? [TransportMode.LIFT, TransportMode.COACH]
        : [TransportMode.LIFT]

    return uniq(searchFilters.reduce(queryTransportModesReducer, initialModes))
}

function filterModesForRailReplacementBus(
    filters: SearchFilter[],
): Mode | undefined {
    const replacementBus = TransportSubmode.RAIL_REPLACEMENT_BUS
    const filtersIncludeRailOrFlytog = [
        TransportMode.RAIL,
        SearchFilter.FLYTOG,
    ].some((filter) => filters.includes(filter as SearchFilter))

    if (filtersIncludeRailOrFlytog && !filters.includes(SearchFilter.BUS)) {
        return {
            transportMode: TransportMode.BUS,
            transportSubModes: [replacementBus],
        }
    }

    if (filters.includes(SearchFilter.BUS) && !filtersIncludeRailOrFlytog) {
        const allOtherBusSubModes = ALL_BUS_SUBMODES.filter(
            (filter: TransportSubmode) => filter !== replacementBus,
        )

        return {
            transportMode: TransportMode.BUS,
            transportSubModes: allOtherBusSubModes,
        }
    }
}

function filterModesForAirportLinkRail(
    filters: SearchFilter[],
): Mode | undefined {
    const airportRail = TransportSubmode.AIRPORT_LINK_RAIL

    if (
        filters.includes(SearchFilter.FLYTOG) &&
        !filters.includes(SearchFilter.RAIL)
    ) {
        return {
            transportMode: TransportMode.RAIL,
            transportSubModes: [airportRail],
        }
    }

    if (
        filters.includes(SearchFilter.RAIL) &&
        !filters.includes(SearchFilter.FLYTOG)
    ) {
        const allOtherRailSubModes: TransportSubmode[] =
            ALL_RAIL_SUBMODES.filter(
                (mode: TransportSubmode) => mode !== airportRail,
            )

        return {
            transportMode: TransportMode.RAIL,
            transportSubModes: allOtherRailSubModes,
        }
    }

    return undefined
}

function filterModesForAirportLinkBus(
    filters: SearchFilter[],
    previousBusSubModes: TransportSubmode[],
): Mode | undefined {
    if (
        filters.includes(SearchFilter.FLYBUSS) &&
        !filters.includes(SearchFilter.BUS)
    ) {
        return {
            transportMode: TransportMode.BUS,
            transportSubModes: [
                ...previousBusSubModes,
                TransportSubmode.AIRPORT_LINK_BUS,
            ],
        }
    }

    if (
        filters.includes(SearchFilter.BUS) &&
        !filters.includes(SearchFilter.FLYBUSS)
    ) {
        const filtersIncludeRailOrFlytog = [
            SearchFilter.RAIL,
            SearchFilter.FLYTOG,
        ].some((filter) => filters.includes(filter as SearchFilter))

        const allOtherBusSubModes = ALL_BUS_SUBMODES.filter(
            (mode) =>
                mode !== TransportSubmode.AIRPORT_LINK_BUS &&
                (filtersIncludeRailOrFlytog ||
                    mode !== TransportSubmode.RAIL_REPLACEMENT_BUS),
        )

        return {
            transportMode: TransportMode.BUS,
            transportSubModes: allOtherBusSubModes,
        }
    }
}

function isSameMode(a: Mode, b: Mode): boolean {
    return a.transportMode === b.transportMode
}

function updateMode(modes: Mode[], mode: Mode): Mode[] {
    if (!modes.some((m) => isSameMode(m, mode))) {
        return [...modes, mode]
    }
    return modes.map((m) => (isSameMode(m, mode) ? mode : m))
}

export function filterModesAndSubModes(filters?: SearchFilter[]): Modes {
    if (!filters) {
        return DEFAULT_MODES
    }

    let filteredModes: Mode[] = convertSearchFiltersToMode(filters).map(
        (transportMode) => ({ transportMode }),
    )

    /*
     * Handle the 'railReplacementBus' sub mode as either a rail-related sub mode
     * or flytog-related sub mode, instead of a bus-related sub mode.
     */
    const modeForReplacementBus = filterModesForRailReplacementBus(filters)
    if (modeForReplacementBus) {
        filteredModes = updateMode(filteredModes, modeForReplacementBus)
    }

    /*
     * Handle the 'flytog' mode as the 'airportLinkRail' sub mode.
     * Black-/Whitelist 'flytog' depending on 'rail' filter for more finely tuned results.
     */
    const modeForAirportLinkRail = filterModesForAirportLinkRail(filters)
    if (modeForAirportLinkRail) {
        filteredModes = updateMode(filteredModes, modeForAirportLinkRail)
    }

    /*
     * Handle the 'flybuss' mode as the 'airportLinkBus' sub mode.
     * Merge bus-related sub modes with existing bus-related sub modes.
     */
    const busMode = filteredModes.find(
        (m) => m.transportMode === TransportMode.BUS,
    )
    const modeForAirportLinkBus = filterModesForAirportLinkBus(
        filters,
        busMode?.transportSubModes || [],
    )
    if (modeForAirportLinkBus) {
        filteredModes = updateMode(filteredModes, modeForAirportLinkBus)
    }

    return {
        ...DEFAULT_MODES,
        transportModes: filteredModes,
    }
}
