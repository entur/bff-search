import {
    LegMode,
    TransportMode,
    TransportSubmode,
    TransportSubmodeParam,
} from '@entur/sdk'

import { filterModesAndSubModes } from './modes'

import { SearchFilter } from '../types'

import { ALL_BUS_SUBMODES, ALL_RAIL_SUBMODES } from '../constants'

const flytogWhitelist = { authorities: ['FLT:Authority:FLT'] }

function getBusFilter(filters: TransportSubmodeParam[]): TransportSubmodeParam {
    return filters.find(
        (filter) => filter.transportMode === TransportMode.BUS,
    ) as TransportSubmodeParam
}

function getRailFilter(
    filters: TransportSubmodeParam[],
): TransportSubmodeParam {
    return filters.find(
        (filter) => filter.transportMode === TransportMode.RAIL,
    ) as TransportSubmodeParam
}

describe('filterModesAndSubModes', () => {
    it('should add foot if not included', () => {
        const modesWithoutFoot: any = [
            SearchFilter.BUS,
            'coach',
            SearchFilter.METRO,
            SearchFilter.RAIL,
        ]

        const { filteredModes: withFoot } =
            filterModesAndSubModes(modesWithoutFoot)
        expect(withFoot).toContain('foot')
    })

    it('should include bus mode and railReplacementBus sub mode if rail mode is present', () => {
        const modesWithRailWithoutBus: SearchFilter[] = [
            SearchFilter.RAIL,
            SearchFilter.METRO,
            SearchFilter.AIR,
            SearchFilter.WATER,
        ]
        const { filteredModes, subModesFilter } = filterModesAndSubModes(
            modesWithRailWithoutBus,
        )
        const busFilter = getBusFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.BUS)
        expect(busFilter.transportMode).toEqual(LegMode.BUS)
        expect(busFilter.transportSubmodes).toContain(
            TransportSubmode.RAIL_REPLACEMENT_BUS,
        )
    })

    it('should include bus mode and railReplacementBus sub mode if flytog mode is present', () => {
        const modesWithFlytogWithoutBus: SearchFilter[] = [
            SearchFilter.FLYTOG,
            SearchFilter.METRO,
            SearchFilter.AIR,
            SearchFilter.WATER,
        ]
        const { filteredModes, subModesFilter } = filterModesAndSubModes(
            modesWithFlytogWithoutBus,
        )
        const busFilter = getBusFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.BUS)
        expect(busFilter.transportMode).toEqual(LegMode.BUS)
        expect(busFilter.transportSubmodes).toContain(
            TransportSubmode.RAIL_REPLACEMENT_BUS,
        )
    })

    it('should include all sub modes except railReplacementBus if bus is present and both rail and flytog are missing', () => {
        const modesWithoutRailWithBus: SearchFilter[] = [
            SearchFilter.BUS,
            SearchFilter.FLYBUSS,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.WATER,
        ]
        const { subModesFilter } = filterModesAndSubModes(
            modesWithoutRailWithBus,
        )
        const busFilter = getBusFilter(subModesFilter)

        expect(busFilter.transportSubmodes.length).toEqual(
            ALL_BUS_SUBMODES.filter(Boolean).length - 1,
        )
        expect(busFilter.transportSubmodes).not.toContain(
            TransportSubmode.RAIL_REPLACEMENT_BUS,
        )
    })

    it('should include rail mode and airportLinkRail sub mode if rail is missing and flytog is present', () => {
        const modesWithoutRailWithFlytog: SearchFilter[] = [
            SearchFilter.FLYTOG,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.WATER,
        ]
        const { filteredModes, subModesFilter } = filterModesAndSubModes(
            modesWithoutRailWithFlytog,
        )
        const railFilter = getRailFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.RAIL)
        expect(railFilter.transportMode).toEqual(LegMode.RAIL)
        expect(railFilter.transportSubmodes).toContain(
            TransportSubmode.AIRPORT_LINK_RAIL,
        )
    })

    it('should whitelist FLT if only foot and flytog are present', () => {
        const modesWithOnlyFootAndFlytog: any[] = [SearchFilter.FLYTOG, 'foot']
        const { banned, whiteListed } = filterModesAndSubModes(
            modesWithOnlyFootAndFlytog,
        )

        expect(banned).toBeUndefined()
        expect(whiteListed).toEqual(flytogWhitelist)
    })

    it('should include all sub modes except airportLinkRail, and blacklist FLT, if rail is present and flytog is missing', () => {
        const modesWithRailWithoutFlytog: SearchFilter[] = [
            SearchFilter.RAIL,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.AIR,
        ]
        const { subModesFilter, banned } = filterModesAndSubModes(
            modesWithRailWithoutFlytog,
        )
        const railFilter = getRailFilter(subModesFilter)

        expect(railFilter.transportSubmodes.length).toEqual(
            ALL_RAIL_SUBMODES.length - 1,
        )
        expect(railFilter.transportSubmodes).not.toContain(
            TransportSubmode.AIRPORT_LINK_RAIL,
        )
        expect(banned).toEqual(flytogWhitelist)
    })

    it('should not include any rail sub modes if both rail and flytog are present', () => {
        const modesWithoutRailWithFlytog: SearchFilter[] = [
            SearchFilter.RAIL,
            SearchFilter.FLYTOG,
            SearchFilter.METRO,
            SearchFilter.WATER,
        ]
        const { filteredModes, subModesFilter } = filterModesAndSubModes(
            modesWithoutRailWithFlytog,
        )
        const railFilter = getRailFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.RAIL)
        expect(railFilter).toBeUndefined()
    })

    it('should include bus mode and airportLinkBus sub mode if bus is missing and flybuss is present', () => {
        const modesWithoutBusWithFlybuss: SearchFilter[] = [
            SearchFilter.FLYBUSS,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.WATER,
        ]
        const { filteredModes, subModesFilter } = filterModesAndSubModes(
            modesWithoutBusWithFlybuss,
        )
        const busFilter = getBusFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.BUS)
        expect(busFilter.transportMode).toEqual(LegMode.BUS)
        expect(busFilter.transportSubmodes).toContain(
            TransportSubmode.AIRPORT_LINK_BUS,
        )
    })

    it('should include all sub modes except airportLinkBus if bus is present and flybuss is missing', () => {
        const modesWithBusWithoutFlybuss: SearchFilter[] = [
            SearchFilter.BUS,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.AIR,
        ]
        const { subModesFilter } = filterModesAndSubModes(
            modesWithBusWithoutFlybuss,
        )
        const busFilter = getBusFilter(subModesFilter)

        expect(busFilter.transportSubmodes.length).toEqual(
            ALL_BUS_SUBMODES.filter(Boolean).length - 1,
        )
        expect(busFilter.transportSubmodes).not.toContain(
            TransportSubmode.AIRPORT_LINK_BUS,
        )
    })
})
