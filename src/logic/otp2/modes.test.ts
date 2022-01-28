import {
    TransportMode,
    TransportModes,
    TransportSubmode,
    Modes,
} from '@entur/sdk/lib/journeyPlanner/types'

import { filterModesAndSubModes } from './modes'

import { SearchFilter } from '../../types'

import { ALL_BUS_SUBMODES, ALL_RAIL_SUBMODES } from '../../constants'

function getBusFilter(modes: Modes): TransportModes | undefined {
    return (
        modes.transportModes?.find(
            (mode) => mode?.transportMode === TransportMode.Bus,
        ) || undefined
    )
}

function getRailFilter(modes: Modes): TransportModes | undefined {
    return (
        modes.transportModes?.find(
            (mode) => mode?.transportMode === TransportMode.Rail,
        ) || undefined
    )
}

describe('filterModesAndSubModes', () => {
    it('should include bus mode and railReplacementBus sub mode if rail mode is present', () => {
        const modesWithRailWithoutBus: SearchFilter[] = [
            SearchFilter.RAIL,
            SearchFilter.METRO,
            SearchFilter.AIR,
            SearchFilter.WATER,
        ]
        const filteredModes = filterModesAndSubModes(modesWithRailWithoutBus)
        const busMode = getBusFilter(filteredModes)

        expect(busMode).toBeTruthy()
        expect(busMode?.transportSubModes).toContain(
            TransportSubmode.RailReplacementBus,
        )
    })

    it('should include bus mode and railReplacementBus sub mode if flytog mode is present', () => {
        const modesWithFlytogWithoutBus: SearchFilter[] = [
            SearchFilter.FLYTOG,
            SearchFilter.METRO,
            SearchFilter.AIR,
            SearchFilter.WATER,
        ]
        const filteredModes = filterModesAndSubModes(modesWithFlytogWithoutBus)
        const busMode = getBusFilter(filteredModes)

        expect(busMode).toBeTruthy()
        expect(busMode?.transportSubModes).toContain(
            TransportSubmode.RailReplacementBus,
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
        const modes = filterModesAndSubModes(modesWithoutRailWithBus)
        const busMode = getBusFilter(modes)

        expect(busMode?.transportSubModes).toHaveLength(
            ALL_BUS_SUBMODES.length - 1,
        )
        expect(busMode?.transportSubModes).not.toContain(
            TransportSubmode.RailReplacementBus,
        )
    })

    it('should include all sub modes except railReplacementBus and airportLinkBus if bus is present and both rail, flytog and flybuss are missing', () => {
        const modesWithoutRailWithBus: SearchFilter[] = [
            SearchFilter.BUS,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.WATER,
        ]
        const modes = filterModesAndSubModes(modesWithoutRailWithBus)
        const busMode = getBusFilter(modes)

        expect(busMode?.transportSubModes).toHaveLength(
            ALL_BUS_SUBMODES.length - 2,
        )
        expect(busMode?.transportSubModes).not.toContain(
            TransportSubmode.RailReplacementBus,
        )
        expect(busMode?.transportSubModes).not.toContain(
            TransportSubmode.AirportLinkBus,
        )
    })

    it('should include rail mode and airportLinkRail sub mode if rail is missing and flytog is present', () => {
        const modesWithoutRailWithFlytog: SearchFilter[] = [
            SearchFilter.FLYTOG,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.WATER,
        ]
        const filteredModes = filterModesAndSubModes(modesWithoutRailWithFlytog)
        const railFilter = getRailFilter(filteredModes)

        expect(railFilter).toBeTruthy()
        expect(railFilter?.transportSubModes).toContain(
            TransportSubmode.AirportLinkRail,
        )
    })

    it('should include all sub modes except airportLinkRail if rail is present and flytog is missing', () => {
        const modesWithRailWithoutFlytog: SearchFilter[] = [
            SearchFilter.RAIL,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.AIR,
        ]
        const modes = filterModesAndSubModes(modesWithRailWithoutFlytog)
        const railFilter = getRailFilter(modes)

        expect(railFilter?.transportSubModes).toHaveLength(
            ALL_RAIL_SUBMODES.length - 1,
        )
        expect(railFilter?.transportSubModes).not.toContain(
            TransportSubmode.AirportLinkRail,
        )
    })

    it('should not include any rail sub modes if both rail and flytog are present', () => {
        const modesWithoutRailWithFlytog: SearchFilter[] = [
            SearchFilter.RAIL,
            SearchFilter.FLYTOG,
            SearchFilter.METRO,
            SearchFilter.WATER,
        ]
        const filteredModes = filterModesAndSubModes(modesWithoutRailWithFlytog)
        const railFilter = getRailFilter(filteredModes)
        expect(railFilter).toBeTruthy()
        expect(railFilter?.transportSubModes).toBeUndefined()
    })

    it('should include bus mode and airportLinkBus sub mode if bus is missing and flybuss is present', () => {
        const modesWithoutBusWithFlybuss: SearchFilter[] = [
            SearchFilter.FLYBUSS,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.WATER,
        ]
        const modes = filterModesAndSubModes(modesWithoutBusWithFlybuss)
        const busMode = getBusFilter(modes)
        expect(busMode).toBeTruthy()
        expect(busMode?.transportSubModes).toBeTruthy()
        expect(busMode?.transportSubModes).toHaveLength(1)
        expect(busMode?.transportSubModes).toContain(
            TransportSubmode.AirportLinkBus,
        )
    })

    it('should include all sub modes except airportLinkBus if bus is present and flybuss is missing', () => {
        const modesWithBusWithoutFlybuss: SearchFilter[] = [
            SearchFilter.BUS,
            SearchFilter.RAIL,
            SearchFilter.TRAM,
            SearchFilter.METRO,
            SearchFilter.AIR,
        ]
        const modes = filterModesAndSubModes(modesWithBusWithoutFlybuss)
        const busMode = getBusFilter(modes)

        expect(busMode?.transportSubModes).toHaveLength(
            ALL_BUS_SUBMODES.length - 1,
        )
        expect(busMode?.transportSubModes).not.toContain(
            TransportSubmode.AirportLinkBus,
        )
    })
})
