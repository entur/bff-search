import { satisfies } from 'semver'

import {
    StreetMode,
    Modes,
    TransportMode,
    TransportModes,
    TransportSubmode,
    InputMaybe,
} from '@entur/sdk/lib/journeyPlanner/types'
import { uniq } from '../../utils/array'
import { SearchFilter } from '../../types'
import {
    ALL_BUS_SUBMODES,
    ALL_RAIL_SUBMODES,
    ALL_WATER_SUBMODES,
    ALL_CAR_FERRY_SUBMODES,
} from '../../constants'

export const DEFAULT_MODES: Modes = {
    accessMode: StreetMode.Foot,
    egressMode: StreetMode.Foot,
    transportModes: [
        { transportMode: TransportMode.Bus },
        { transportMode: TransportMode.Coach },
        { transportMode: TransportMode.Tram },
        { transportMode: TransportMode.Rail },
        { transportMode: TransportMode.Metro },
        { transportMode: TransportMode.Water },
        { transportMode: TransportMode.Air },
        { transportMode: TransportMode.Lift },
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
    version?: string,
    platform?: string,
): TransportMode[] {
    /*
     * TODO: Odden 19.01.21 - Older app-versioons need to include coach when bus is enabled.
     *  Remove version and platform check 2 weeks after release of 8.11.0
     */
    const shouldIncludeCoachInSearchFilter =
        platform === 'APP' && version && satisfies(version, '<=8.10.1')

    const initialModes: TransportMode[] =
        searchFilters.includes(SearchFilter.BUS) &&
        shouldIncludeCoachInSearchFilter
            ? [TransportMode.Lift, TransportMode.Coach]
            : [TransportMode.Lift]

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
    version?: string,
    platform?: string,
): Modes {
    if (!filters) {
        return DEFAULT_MODES
    }

    let filteredModes: TransportModes[] = convertSearchFiltersToMode(
        filters,
        version,
        platform,
    ).map((transportMode) => ({ transportMode }))

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

    /*
     * Handle the 'CAR_FERRY' mode as the 'internationalCarFerry', 'localCarFerry', 'nationalCarFerry' and 'regionalCarFerry' sub mode.
     * Merge car-ferry-related sub modes with ferry-related sub modes.
     */
    const shouldExcludeCarFerryAsSearchFilter =
        platform === 'APP' && version && satisfies(version, '<=8.10.1')

    const modeForCarFerry = shouldExcludeCarFerryAsSearchFilter
        ? undefined
        : filterModesForCarFerry(filters)
    /*
     * TODO: Odden 19.01.21 - Older app-versioons need to include coach when bus is enabled.
     *  Remove version and platform check 2 weeks after release of 8.11.0
     */
    if (modeForCarFerry) {
        filteredModes = updateMode(filteredModes, modeForCarFerry)
    }

    return {
        ...DEFAULT_MODES,
        transportModes: filteredModes,
    }
}
