import {
    LegMode,
    QueryMode,
    TransportSubmode,
    TransportSubmodeParam,
} from '@entur/sdk'

import { FilteredModesAndSubModes, SearchFilterType } from '../../types'

import {
    ALL_BUS_SUBMODES,
    ALL_RAIL_SUBMODES,
    DEFAULT_QUERY_MODES,
} from '../constants'

import { difference, intersection, uniq } from './array'

const flybuss = 'flybuss'
const flytog = 'flytog'
const flytogWhitelist = { authorities: ['FLT:Authority:FLT'] }

export function filterModesAndSubModes(
    modes?: SearchFilterType[],
): FilteredModesAndSubModes {
    if (!modes)
        return { filteredModes: DEFAULT_QUERY_MODES, subModesFilter: [] }

    let filteredModes: QueryMode[] = convertSearchFiltersToMode(modes)
    let subModesFilter: TransportSubmodeParam[] = []

    /*
     * Handle the 'railReplacementBus' sub mode as either a rail-related sub mode
     * or flytog-related sub mode, instead of a bus-related sub mode.
     */
    const filtersForReplacementBus = filterModesForRailReplacementBus(modes)
    filteredModes = [
        ...filteredModes,
        ...filtersForReplacementBus.filteredModes,
    ]
    subModesFilter = [
        ...subModesFilter,
        ...filtersForReplacementBus.subModesFilter,
    ]

    /*
     * Handle the 'flytog' mode as the 'airportLinkRail' sub mode.
     * Black-/Whitelist 'flytog' depending on 'rail' filter for more finely tuned results.
     */
    const filtersForAirportLinkRail = filterModesForAirportLinkRail(modes)
    const banned = filtersForAirportLinkRail.banned
    const whiteListed = filtersForAirportLinkRail.whiteListed
    filteredModes = [
        ...filteredModes,
        ...filtersForAirportLinkRail.filteredModes,
    ]
    subModesFilter = [
        ...subModesFilter,
        ...filtersForAirportLinkRail.subModesFilter,
    ]

    /*
     * Handle the 'flybuss' mode as the 'airportLinkBus' sub mode.
     * Merge bus-related sub modes with existing bus-related sub modes.
     */
    const prevBusSubModes =
        subModesFilter.find(isBusSubModesFilter)?.transportSubmodes || []
    const prevOtherSubModeFilters = subModesFilter.filter(
        (transportFilter) => !isBusSubModesFilter(transportFilter),
    )
    const filtersForAirportLinkBus = filterModesForAirportLinkBus(
        modes,
        prevBusSubModes,
    )
    filteredModes = [
        ...filteredModes,
        ...filtersForAirportLinkBus.filteredModes,
    ]
    subModesFilter = [
        ...prevOtherSubModeFilters,
        ...filtersForAirportLinkBus.subModesFilter,
    ]

    return {
        filteredModes,
        subModesFilter,
        banned,
        whiteListed,
    }
}

function filterModesForRailReplacementBus(
    modes: SearchFilterType[],
): FilteredModesAndSubModes {
    const replacementBus = TransportSubmode.RAIL_REPLACEMENT_BUS
    const modesIncludeRailOrFlytog = intersection(modes, [LegMode.RAIL, flytog])
        .length

    if (modesIncludeRailOrFlytog && !modes.includes(LegMode.BUS)) {
        return {
            filteredModes: [LegMode.BUS],
            subModesFilter: [
                {
                    transportMode: LegMode.BUS,
                    transportSubmodes: [replacementBus],
                },
            ],
        }
    }

    if (modes.includes(LegMode.BUS) && !modesIncludeRailOrFlytog) {
        const allOtherBusSubModes = ALL_BUS_SUBMODES.filter(
            (mode) => mode !== replacementBus,
        )

        return {
            filteredModes: [],
            subModesFilter: [
                {
                    transportMode: LegMode.BUS,
                    transportSubmodes: allOtherBusSubModes,
                },
            ],
        }
    }

    return { filteredModes: [], subModesFilter: [] }
}

function filterModesForAirportLinkRail(
    modes: SearchFilterType[],
): FilteredModesAndSubModes {
    const airportRail = TransportSubmode.AIRPORT_LINK_RAIL
    const onlyFootAndFlytog = !difference(modes, [LegMode.FOOT, flytog]).length

    if (modes.includes(flytog) && !modes.includes(LegMode.RAIL)) {
        return {
            filteredModes: [LegMode.RAIL],
            subModesFilter: [
                {
                    transportMode: LegMode.RAIL,
                    transportSubmodes: [airportRail],
                },
            ],
            whiteListed: onlyFootAndFlytog ? flytogWhitelist : undefined,
        }
    }

    if (modes.includes(LegMode.RAIL) && !modes.includes(flytog)) {
        const allOtherRailSubModes = ALL_RAIL_SUBMODES.filter(
            (mode) => mode !== airportRail,
        )

        return {
            filteredModes: [],
            subModesFilter: [
                {
                    transportMode: LegMode.RAIL,
                    transportSubmodes: allOtherRailSubModes,
                },
            ],
            banned: flytogWhitelist,
        }
    }

    return { filteredModes: [], subModesFilter: [] }
}

function filterModesForAirportLinkBus(
    modes: SearchFilterType[],
    prevBusSubModes: TransportSubmode[],
): FilteredModesAndSubModes {
    if (modes.includes(flybuss) && !modes.includes(LegMode.BUS)) {
        return {
            filteredModes: [LegMode.BUS],
            subModesFilter: [
                {
                    transportMode: LegMode.BUS,
                    transportSubmodes: [
                        ...prevBusSubModes,
                        TransportSubmode.AIRPORT_LINK_BUS,
                    ],
                },
            ],
        }
    }

    if (modes.includes(LegMode.BUS) && !modes.includes(flybuss)) {
        const isReplacementBusIncluded = prevBusSubModes.includes(
            TransportSubmode.RAIL_REPLACEMENT_BUS,
        )
        const allOtherBusSubModes = ALL_BUS_SUBMODES.filter(
            (mode) =>
                mode !== TransportSubmode.AIRPORT_LINK_BUS &&
                (!isReplacementBusIncluded ||
                    mode !== TransportSubmode.RAIL_REPLACEMENT_BUS),
        )

        return {
            filteredModes: [],
            subModesFilter: [
                {
                    transportMode: LegMode.BUS,
                    transportSubmodes: allOtherBusSubModes,
                },
            ],
        }
    }

    const defaultSubModesFilter = prevBusSubModes.length
        ? [
              {
                  transportMode: LegMode.BUS,
                  transportSubmodes: prevBusSubModes,
              },
          ]
        : []

    return { filteredModes: [], subModesFilter: defaultSubModesFilter }
}

function convertSearchFiltersToMode(
    searchFilters: SearchFilterType[],
): QueryMode[] {
    const initialModes: QueryMode[] = searchFilters.includes('bus')
        ? ['foot', 'coach']
        : ['foot']

    return uniq(searchFilters.reduce(queryTransportModesReducer, initialModes))
}

function queryTransportModesReducer(
    transportModes: QueryMode[],
    mode: string,
): QueryMode[] {
    return isQueryTransportMode(mode)
        ? [...transportModes, mode as QueryMode]
        : transportModes
}

function isBusSubModesFilter({
    transportMode,
}: TransportSubmodeParam): boolean {
    return transportMode === LegMode.BUS
}

function isQueryTransportMode(mode: QueryMode | string): boolean {
    return (
        mode === 'air' ||
        mode === 'bicycle' ||
        mode === 'bus' ||
        mode === 'cableway' ||
        mode === 'water' ||
        mode === 'funicular' ||
        mode === 'lift' ||
        mode === 'rail' ||
        mode === 'metro' ||
        mode === 'tram' ||
        mode === 'coach' ||
        mode === 'transit' ||
        mode === 'foot' ||
        mode === 'car' ||
        mode === 'car_park' ||
        mode === 'car_dropoff' ||
        mode === 'car_pickup'
    )
}

export function isTransportMode(mode: string): boolean {
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
