import { LegMode, TransportSubmode, TransportSubmodeParam } from '@entur/sdk'

import { filterModesAndSubModes } from './modes'

import { SearchFilterType } from '../../types'

import { ALL_BUS_SUBMODES, ALL_RAIL_SUBMODES } from '../constants'

const flytogWhitelist = { authorities: ['FLT:Authority:FLT'] }

function getBusFilter(filters: TransportSubmodeParam[]): TransportSubmodeParam {
    return filters.find((filter) => filter.transportMode === LegMode.BUS) as TransportSubmodeParam
}

function getRailFilter(filters: TransportSubmodeParam[]): TransportSubmodeParam {
    return filters.find((filter) => filter.transportMode === LegMode.RAIL) as TransportSubmodeParam
}

describe('filterModesAndSubModes', () => {
    it('should include coach mode if bus mode is present', () => {
        const modesWithBusWithoutCoach: SearchFilterType[] = ['rail', 'metro', 'bus', 'water']
        const modesWithBusAndCoach: any = ['foot', 'bus', 'coach']
        const { filteredModes: withoutCoach } = filterModesAndSubModes(modesWithBusWithoutCoach)
        const { filteredModes: withCoach } = filterModesAndSubModes(modesWithBusAndCoach)

        expect(withoutCoach).toContain(LegMode.COACH)
        expect(withCoach).toEqual(expect.arrayContaining(modesWithBusAndCoach))
    })

    it('should add foot if not included', () => {
        const modesWithoutFoot: any = ['bus', 'coach', 'metro', 'rail']
        const modesWithFoot: any = ['bus', 'coach', 'foot', 'metro', 'rail']
        const { filteredModes: withFoot } = filterModesAndSubModes(modesWithoutFoot)
        expect(withFoot).toEqual(expect.arrayContaining(modesWithFoot))

        const { filteredModes: withNoDuplicateFoot } = filterModesAndSubModes(modesWithFoot)
        expect(withNoDuplicateFoot.length).toBe(modesWithFoot.length)
        expect(withNoDuplicateFoot).toEqual(expect.arrayContaining(modesWithFoot))
    })

    it('should include bus mode and railReplacementBus sub mode if rail mode is present', () => {
        const modesWithRailWithoutBus: SearchFilterType[] = ['rail', 'metro', 'air', 'water']
        const { filteredModes, subModesFilter } = filterModesAndSubModes(modesWithRailWithoutBus)
        const busFilter = getBusFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.BUS)
        expect(busFilter.transportMode).toEqual(LegMode.BUS)
        expect(busFilter.transportSubmodes).toContain(TransportSubmode.RAIL_REPLACEMENT_BUS)
    })

    it('should include bus mode and railReplacementBus sub mode if flytog mode is present', () => {
        const modesWithFlytogWithoutBus: SearchFilterType[] = ['flytog', 'metro', 'air', 'water']
        const { filteredModes, subModesFilter } = filterModesAndSubModes(modesWithFlytogWithoutBus)
        const busFilter = getBusFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.BUS)
        expect(busFilter.transportMode).toEqual(LegMode.BUS)
        expect(busFilter.transportSubmodes).toContain(TransportSubmode.RAIL_REPLACEMENT_BUS)
    })

    it('should include all sub modes except railReplacementBus if bus is present and both rail and flytog are missing', () => {
        const modesWithoutRailWithBus: SearchFilterType[] = ['bus', 'flybuss', 'tram', 'metro', 'water']
        const { subModesFilter } = filterModesAndSubModes(modesWithoutRailWithBus)
        const busFilter = getBusFilter(subModesFilter)

        expect(busFilter.transportSubmodes.length).toEqual(ALL_BUS_SUBMODES.filter(Boolean).length - 1)
        expect(busFilter.transportSubmodes).not.toContain(TransportSubmode.RAIL_REPLACEMENT_BUS)
    })

    it('should include rail mode and airportLinkRail sub mode if rail is missing and flytog is present', () => {
        const modesWithoutRailWithFlytog: SearchFilterType[] = ['flytog', 'tram', 'metro', 'water']
        const { filteredModes, subModesFilter } = filterModesAndSubModes(modesWithoutRailWithFlytog)
        const railFilter = getRailFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.RAIL)
        expect(railFilter.transportMode).toEqual(LegMode.RAIL)
        expect(railFilter.transportSubmodes).toContain(TransportSubmode.AIRPORT_LINK_RAIL)
    })

    it('should whitelist FLT if only foot and flytog are present', () => {
        const modesWithOnlyFootAndFlytog: any[] = ['flytog', 'foot']
        const { banned, whiteListed } = filterModesAndSubModes(modesWithOnlyFootAndFlytog)

        expect(banned).toBeUndefined()
        expect(whiteListed).toEqual(flytogWhitelist)
    })

    it('should include all sub modes except airportLinkRail, and blacklist FLT, if rail is present and flytog is missing', () => {
        const modesWithRailWithoutFlytog: SearchFilterType[] = ['rail', 'tram', 'metro', 'air']
        const { subModesFilter, banned } = filterModesAndSubModes(modesWithRailWithoutFlytog)
        const railFilter = getRailFilter(subModesFilter)

        expect(railFilter.transportSubmodes.length).toEqual(ALL_RAIL_SUBMODES.length - 1)
        expect(railFilter.transportSubmodes).not.toContain(TransportSubmode.AIRPORT_LINK_RAIL)
        expect(banned).toEqual(flytogWhitelist)
    })

    it('should not include any rail sub modes if both rail and flytog are present', () => {
        const modesWithoutRailWithFlytog: SearchFilterType[] = ['rail', 'flytog', 'metro', 'water']
        const { filteredModes, subModesFilter } = filterModesAndSubModes(modesWithoutRailWithFlytog)
        const railFilter = getRailFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.RAIL)
        expect(railFilter).toBeUndefined()
    })

    it('should include bus mode and airportLinkBus sub mode if bus is missing and flybuss is present', () => {
        const modesWithoutBusWithFlybuss: SearchFilterType[] = ['flybuss', 'tram', 'metro', 'water']
        const { filteredModes, subModesFilter } = filterModesAndSubModes(modesWithoutBusWithFlybuss)
        const busFilter = getBusFilter(subModesFilter)

        expect(filteredModes).toContain(LegMode.BUS)
        expect(busFilter.transportMode).toEqual(LegMode.BUS)
        expect(busFilter.transportSubmodes).toContain(TransportSubmode.AIRPORT_LINK_BUS)
    })

    it('should include all sub modes except airportLinkBus if bus is present and flybuss is missing', () => {
        const modesWithBusWithoutFlybuss: SearchFilterType[] = ['bus', 'tram', 'metro', 'air']
        const { subModesFilter } = filterModesAndSubModes(modesWithBusWithoutFlybuss)
        const busFilter = getBusFilter(subModesFilter)

        expect(busFilter.transportSubmodes.length).toEqual(ALL_BUS_SUBMODES.filter(Boolean).length - 1)
        expect(busFilter.transportSubmodes).not.toContain(TransportSubmode.AIRPORT_LINK_BUS)
    })
})
