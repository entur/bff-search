import { LegMode, TransportSubmode } from '@entur/sdk'

import { filterModesAndSubModes, Modes, Mode } from './modes'

import { SearchFilterType } from '../../types'

import { ALL_BUS_SUBMODES, ALL_RAIL_SUBMODES } from '../constants'

function getBusFilter(modes: Modes): Mode | undefined {
    return modes.transportModes.find(
        (mode) => mode.transportMode === LegMode.BUS,
    )
}

function getRailFilter(modes: Modes): Mode | undefined {
    return modes.transportModes.find(
        (mode) => mode.transportMode === LegMode.RAIL,
    )
}

describe('filterModesAndSubModes', () => {
    it('should include coach mode if bus mode is present', () => {
        const modesWithBusWithoutCoach: SearchFilterType[] = [
            'rail',
            'metro',
            'bus',
            'water',
        ]
        const modesWithBusAndCoach: any = ['bus', 'coach']
        const withoutCoach = filterModesAndSubModes(modesWithBusWithoutCoach)
        const withCoach = filterModesAndSubModes(modesWithBusAndCoach)

        const coach = withoutCoach.transportModes.some(
            (m) => m.transportMode === LegMode.COACH,
        )
        expect(coach).toEqual(true)

        const alreadyCoach = withCoach.transportModes.some(
            (m) => m.transportMode === LegMode.COACH,
        )
        expect(alreadyCoach).toEqual(true)
        expect(withCoach.transportModes).toHaveLength(
            modesWithBusAndCoach.length,
        )
    })

    it('should include bus mode and railReplacementBus sub mode if rail mode is present', () => {
        const modesWithRailWithoutBus: SearchFilterType[] = [
            'rail',
            'metro',
            'air',
            'water',
        ]
        const filteredModes = filterModesAndSubModes(modesWithRailWithoutBus)
        const busMode = getBusFilter(filteredModes)

        expect(busMode).toBeTruthy()
        expect(busMode?.transportSubModes).toContain(
            TransportSubmode.RAIL_REPLACEMENT_BUS,
        )
    })

    it('should include bus mode and railReplacementBus sub mode if flytog mode is present', () => {
        const modesWithFlytogWithoutBus: SearchFilterType[] = [
            'flytog',
            'metro',
            'air',
            'water',
        ]
        const filteredModes = filterModesAndSubModes(modesWithFlytogWithoutBus)
        const busMode = getBusFilter(filteredModes)

        expect(busMode).toBeTruthy()
        expect(busMode?.transportSubModes).toContain(
            TransportSubmode.RAIL_REPLACEMENT_BUS,
        )
    })

    it('should include all sub modes except railReplacementBus if bus is present and both rail and flytog are missing', () => {
        const modesWithoutRailWithBus: SearchFilterType[] = [
            'bus',
            'flybuss',
            'tram',
            'metro',
            'water',
        ]
        const modes = filterModesAndSubModes(modesWithoutRailWithBus)
        const busMode = getBusFilter(modes)

        expect(busMode?.transportSubModes).toHaveLength(
            ALL_BUS_SUBMODES.length - 1,
        )
        expect(busMode?.transportSubModes).not.toContain(
            TransportSubmode.RAIL_REPLACEMENT_BUS,
        )
    })

    it('should include all sub modes except railReplacementBus and airportLinkBus if bus is present and both rail, flytog and flybuss are missing', () => {
        const modesWithoutRailWithBus: SearchFilterType[] = [
            'bus',
            'tram',
            'metro',
            'water',
        ]
        const modes = filterModesAndSubModes(modesWithoutRailWithBus)
        const busMode = getBusFilter(modes)

        expect(busMode?.transportSubModes).toHaveLength(
            ALL_BUS_SUBMODES.length - 2,
        )
        expect(busMode?.transportSubModes).not.toContain(
            TransportSubmode.RAIL_REPLACEMENT_BUS,
        )
        expect(busMode?.transportSubModes).not.toContain(
            TransportSubmode.AIRPORT_LINK_BUS,
        )
    })

    it('should include rail mode and airportLinkRail sub mode if rail is missing and flytog is present', () => {
        const modesWithoutRailWithFlytog: SearchFilterType[] = [
            'flytog',
            'tram',
            'metro',
            'water',
        ]
        const filteredModes = filterModesAndSubModes(modesWithoutRailWithFlytog)
        const railFilter = getRailFilter(filteredModes)

        expect(railFilter).toBeTruthy()
        expect(railFilter?.transportSubModes).toContain(
            TransportSubmode.AIRPORT_LINK_RAIL,
        )
    })

    it('should include all sub modes except airportLinkRail if rail is present and flytog is missing', () => {
        const modesWithRailWithoutFlytog: SearchFilterType[] = [
            'rail',
            'tram',
            'metro',
            'air',
        ]
        const modes = filterModesAndSubModes(modesWithRailWithoutFlytog)
        const railFilter = getRailFilter(modes)

        expect(railFilter?.transportSubModes).toHaveLength(
            ALL_RAIL_SUBMODES.length - 1,
        )
        expect(railFilter?.transportSubModes).not.toContain(
            TransportSubmode.AIRPORT_LINK_RAIL,
        )
    })

    it('should not include any rail sub modes if both rail and flytog are present', () => {
        const modesWithoutRailWithFlytog: SearchFilterType[] = [
            'rail',
            'flytog',
            'metro',
            'water',
        ]
        const filteredModes = filterModesAndSubModes(modesWithoutRailWithFlytog)
        const railFilter = getRailFilter(filteredModes)
        expect(railFilter).toBeTruthy()
        expect(railFilter?.transportSubModes).toBeUndefined()
    })

    it('should include bus mode and airportLinkBus sub mode if bus is missing and flybuss is present', () => {
        const modesWithoutBusWithFlybuss: SearchFilterType[] = [
            'flybuss',
            'tram',
            'metro',
            'water',
        ]
        const modes = filterModesAndSubModes(modesWithoutBusWithFlybuss)
        const busMode = getBusFilter(modes)
        expect(busMode).toBeTruthy()
        expect(busMode?.transportSubModes).toBeTruthy()
        expect(busMode?.transportSubModes).toHaveLength(1)
        expect(busMode?.transportSubModes).toContain(
            TransportSubmode.AIRPORT_LINK_BUS,
        )
    })

    it('should include all sub modes except airportLinkBus if bus is present and flybuss is missing', () => {
        const modesWithBusWithoutFlybuss: SearchFilterType[] = [
            'bus',
            'rail',
            'tram',
            'metro',
            'air',
        ]
        const modes = filterModesAndSubModes(modesWithBusWithoutFlybuss)
        const busMode = getBusFilter(modes)

        expect(busMode?.transportSubModes).toHaveLength(
            ALL_BUS_SUBMODES.length - 1,
        )
        expect(busMode?.transportSubModes).not.toContain(
            TransportSubmode.AIRPORT_LINK_BUS,
        )
    })
})
