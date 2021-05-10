import {
    LegMode,
    QueryMode,
    TransportMode,
    TransportSubmode,
    TransportSubmodeParam,
} from '@entur/sdk'

import { FilteredModesAndSubModes, SearchFilter } from '../types'

import {
    ALL_BUS_SUBMODES,
    ALL_RAIL_SUBMODES,
    DEFAULT_QUERY_MODES,
} from '../constants'

import { difference, intersection, uniq } from './array'

const flytogWhitelist = { authorities: ['FLT:Authority:FLT'] }

export function filterModesAndSubModes(
    modes?: SearchFilter[],
): FilteredModesAndSubModes {
    if (!modes) {
        return { filteredModes: DEFAULT_QUERY_MODES, subModesFilter: [] }
    }

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
    modes: SearchFilter[],
): FilteredModesAndSubModes {
    const replacementBus = TransportSubmode.RAIL_REPLACEMENT_BUS
    const modesIncludeRailOrFlytog = intersection(modes, [
        SearchFilter.RAIL,
        SearchFilter.FLYTOG,
    ]).length

    if (modesIncludeRailOrFlytog && !modes.includes(SearchFilter.BUS)) {
        return {
            filteredModes: [QueryMode.BUS],
            subModesFilter: [
                {
                    transportMode: TransportMode.BUS,
                    transportSubmodes: [replacementBus],
                },
            ],
        }
    }

    if (modes.includes(SearchFilter.BUS) && !modesIncludeRailOrFlytog) {
        const allOtherBusSubModes = ALL_BUS_SUBMODES.filter(
            (mode) => mode !== replacementBus,
        )

        return {
            filteredModes: [],
            subModesFilter: [
                {
                    transportMode: TransportMode.BUS,
                    transportSubmodes: allOtherBusSubModes,
                },
            ],
        }
    }

    return { filteredModes: [], subModesFilter: [] }
}

function filterModesForAirportLinkRail(
    modes: SearchFilter[],
): FilteredModesAndSubModes {
    const airportRail = TransportSubmode.AIRPORT_LINK_RAIL
    const onlyFootAndFlytog = !difference(modes, [
        LegMode.FOOT,
        SearchFilter.FLYTOG,
    ]).length

    if (
        modes.includes(SearchFilter.FLYTOG) &&
        !modes.includes(SearchFilter.RAIL)
    ) {
        return {
            filteredModes: [QueryMode.RAIL],
            subModesFilter: [
                {
                    transportMode: TransportMode.RAIL,
                    transportSubmodes: [airportRail],
                },
            ],
            whiteListed: onlyFootAndFlytog ? flytogWhitelist : undefined,
        }
    }

    if (
        modes.includes(SearchFilter.RAIL) &&
        !modes.includes(SearchFilter.FLYTOG)
    ) {
        const allOtherRailSubModes = ALL_RAIL_SUBMODES.filter(
            (mode) => mode !== airportRail,
        )

        return {
            filteredModes: [],
            subModesFilter: [
                {
                    transportMode: TransportMode.RAIL,
                    transportSubmodes: allOtherRailSubModes,
                },
            ],
            banned: flytogWhitelist,
        }
    }

    return { filteredModes: [], subModesFilter: [] }
}

function filterModesForAirportLinkBus(
    modes: SearchFilter[],
    prevBusSubModes: TransportSubmode[],
): FilteredModesAndSubModes {
    if (
        modes.includes(SearchFilter.FLYBUSS) &&
        !modes.includes(SearchFilter.BUS)
    ) {
        return {
            filteredModes: [QueryMode.BUS],
            subModesFilter: [
                {
                    transportMode: TransportMode.BUS,
                    transportSubmodes: [
                        ...prevBusSubModes,
                        TransportSubmode.AIRPORT_LINK_BUS,
                    ],
                },
            ],
        }
    }

    if (
        modes.includes(SearchFilter.BUS) &&
        !modes.includes(SearchFilter.FLYBUSS)
    ) {
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
                    transportMode: TransportMode.BUS,
                    transportSubmodes: allOtherBusSubModes,
                },
            ],
        }
    }

    const defaultSubModesFilter = prevBusSubModes.length
        ? [
              {
                  transportMode: TransportMode.BUS,
                  transportSubmodes: prevBusSubModes,
              },
          ]
        : []

    return { filteredModes: [], subModesFilter: defaultSubModesFilter }
}

function convertSearchFiltersToMode(
    searchFilters: SearchFilter[],
): QueryMode[] {
    const initialModes: QueryMode[] = searchFilters.includes(SearchFilter.BUS)
        ? [QueryMode.LIFT, QueryMode.FOOT, QueryMode.COACH]
        : [QueryMode.LIFT, QueryMode.FOOT]

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
    return transportMode === TransportMode.BUS
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
