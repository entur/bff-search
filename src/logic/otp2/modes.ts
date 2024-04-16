import {
    InputMaybe,
    Modes,
    StreetMode,
    TransportMode,
    TransportModes,
    TransportSubmode,
} from '../../generated/graphql'

import { uniq } from '../../utils/array'
import { SearchFilter } from '../../types'
import {
    ALL_BUS_SUBMODES,
    ALL_CAR_FERRY_SUBMODES,
    ALL_RAIL_SUBMODES,
    ALL_WATER_SUBMODES,
} from '../../constants'

const DEFAULT_MODES: Modes = {
    accessMode: StreetMode.Foot,
    directMode: null,
    egressMode: StreetMode.Foot,
    transportModes: [
        { transportMode: TransportMode.Bus, transportSubModes: null },
        { transportMode: TransportMode.Coach, transportSubModes: null },
        { transportMode: TransportMode.Tram, transportSubModes: null },
        { transportMode: TransportMode.Rail, transportSubModes: null },
        { transportMode: TransportMode.Metro, transportSubModes: null },
        { transportMode: TransportMode.Water, transportSubModes: null },
        { transportMode: TransportMode.Air, transportSubModes: null },
        { transportMode: TransportMode.Lift, transportSubModes: null },
    ],
}

const FLEXIBLE_MODES: Modes = {
    ...DEFAULT_MODES,
    accessMode: StreetMode.Flexible,
    egressMode: StreetMode.Flexible,
}

function isTransportMode(mode: string): mode is TransportMode {
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
        mode === 'taxi' ||
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
    const initialModes: TransportMode[] = [TransportMode.Lift]

    return uniq(searchFilters.reduce(queryTransportModesReducer, initialModes))
}

function filterModesForRailReplacementBus(
    filters: SearchFilter[],
): TransportModes | undefined {
    const replacementBus = TransportSubmode.RailReplacementBus
    const filtersIncludeRailOrFlytog = [
        TransportMode.Rail,
        SearchFilter.FLYTOG,
    ].some((filter) => filters.includes(filter as SearchFilter))

    if (filtersIncludeRailOrFlytog && !filters.includes(SearchFilter.BUS)) {
        return {
            transportMode: TransportMode.Bus,
            transportSubModes: [replacementBus],
        }
    }

    if (filters.includes(SearchFilter.BUS) && !filtersIncludeRailOrFlytog) {
        const allOtherBusSubModes = ALL_BUS_SUBMODES.filter(
            (filter: TransportSubmode) => filter !== replacementBus,
        )

        return {
            transportMode: TransportMode.Bus,
            transportSubModes: allOtherBusSubModes,
        }
    }
}

function filterModesForAirportLinkRail(
    filters: SearchFilter[],
): TransportModes | undefined {
    const airportRail = TransportSubmode.AirportLinkRail

    if (
        filters.includes(SearchFilter.FLYTOG) &&
        !filters.includes(SearchFilter.RAIL)
    ) {
        return {
            transportMode: TransportMode.Rail,
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
            transportMode: TransportMode.Rail,
            transportSubModes: allOtherRailSubModes,
        }
    }

    return undefined
}

function filterModesForCarFerry(
    filters: SearchFilter[],
): TransportModes | undefined {
    const carFerries = ALL_CAR_FERRY_SUBMODES

    if (
        filters.includes(SearchFilter.CAR_FERRY) &&
        !filters.includes(SearchFilter.WATER)
    ) {
        return {
            transportMode: TransportMode.Water,
            transportSubModes: carFerries,
        }
    }

    if (
        filters.includes(SearchFilter.WATER) &&
        !filters.includes(SearchFilter.CAR_FERRY)
    ) {
        const allOtherWaterSubModes: TransportSubmode[] =
            ALL_WATER_SUBMODES.filter(
                (mode: TransportSubmode) => !carFerries.includes(mode),
            )

        return {
            transportMode: TransportMode.Water,
            transportSubModes: allOtherWaterSubModes,
        }
    }

    return undefined
}

function filterModesForAirportLinkBus(
    filters: SearchFilter[],
    previousBusSubModes: TransportSubmode[],
): TransportModes | undefined {
    if (
        filters.includes(SearchFilter.FLYBUSS) &&
        !filters.includes(SearchFilter.BUS)
    ) {
        return {
            transportMode: TransportMode.Bus,
            transportSubModes: [
                ...previousBusSubModes,
                TransportSubmode.AirportLinkBus,
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
                mode !== TransportSubmode.AirportLinkBus &&
                (filtersIncludeRailOrFlytog ||
                    mode !== TransportSubmode.RailReplacementBus),
        )

        return {
            transportMode: TransportMode.Bus,
            transportSubModes: allOtherBusSubModes,
        }
    }
}

function isSameMode(a: TransportModes, b: TransportModes): boolean {
    return a.transportMode === b.transportMode
}

function updateMode(
    modes: TransportModes[],
    mode: TransportModes,
): TransportModes[] {
    if (!modes.some((m) => isSameMode(m, mode))) {
        return [...modes, mode]
    }
    return modes.map((m) => (isSameMode(m, mode) ? mode : m))
}

function exists(
    maybe: InputMaybe<TransportSubmode>,
): maybe is TransportSubmode {
    return maybe !== null
}

export function filterModesAndSubModes(
    filters?: SearchFilter[],
    allowFlexible = false,
): Modes {
    if (!filters) {
        return allowFlexible ? DEFAULT_MODES : FLEXIBLE_MODES
    }

    let filteredModes: TransportModes[] = convertSearchFiltersToMode(
        filters,
    ).map((transportMode) => ({ transportMode, transportSubModes: null }))

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
        (m) => m.transportMode === TransportMode.Bus,
    )
    const modeForAirportLinkBus = filterModesForAirportLinkBus(
        filters,
        (busMode?.transportSubModes || []).filter(exists),
    )
    if (modeForAirportLinkBus) {
        filteredModes = updateMode(filteredModes, modeForAirportLinkBus)
    }

    const modeForCarFerry = filterModesForCarFerry(filters)

    if (modeForCarFerry) {
        filteredModes = updateMode(filteredModes, modeForCarFerry)
    }

    return {
        ...(allowFlexible ? DEFAULT_MODES : FLEXIBLE_MODES),
        transportModes: filteredModes,
    }
}
