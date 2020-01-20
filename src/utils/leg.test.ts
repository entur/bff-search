import {
    Leg, LegMode, Place,
} from '@entur/sdk'

import { parseLeg, isFlexibleLeg, isTransitLeg, isBikeRentalLeg } from './leg'

describe('parseLeg', () => {
    it('should map coach legs to bus legs', () => {
        const leg = { mode: LegMode.COACH } as Leg

        expect(parseLeg(leg).mode).toEqual(LegMode.BUS)
    })

    it('should update the fromPlace name of transit legs', () => {
        const oldName = 'place name'
        const newName = 'quay name'
        const buildLeg = (mode: LegMode): Leg => ({
            fromPlace: { name: oldName, quay: { name: newName } }, mode,
        } as Leg)
        const nonTransitLeg = buildLeg(LegMode.FOOT)
        const transitLeg = buildLeg(LegMode.RAIL)

        expect(parseLeg(nonTransitLeg).fromPlace.name).toEqual(oldName)
        expect(parseLeg(transitLeg).fromPlace.name).toEqual(newName)
    })
})

describe('isFlexibleLeg', () => {
    it('should check if the leg has a flexible line type', () => {
        const nonFlexibleLeg = { line: { flexibleLineType: undefined } } as Leg
        const flexibleLeg = { line: { flexibleLineType: 'flexibleAreasOnly' } } as Leg

        expect(isFlexibleLeg(nonFlexibleLeg)).toBeFalsy()
        expect(isFlexibleLeg(flexibleLeg)).toBeTruthy()
    })
})

describe('isTransitLeg', () => {
    it('should check if the leg has a transit mode', () => {
        expect(isTransitLeg({ mode: LegMode.RAIL } as Leg)).toBeTruthy()
        expect(isTransitLeg({ mode: LegMode.AIR } as Leg)).toBeTruthy()
        expect(isTransitLeg({ mode: LegMode.FOOT } as Leg)).toBeFalsy()
        expect(isTransitLeg({ mode: LegMode.BICYCLE } as Leg)).toBeFalsy()
        expect(isTransitLeg({ mode: LegMode.CAR } as Leg)).toBeFalsy()
        expect(isTransitLeg({ mode: LegMode.TRAM } as Leg)).toBeTruthy()
    })
})

describe('isBikeRentalLeg', () => {
    it("should check if the leg's from- and to-places are bike rental stations", () => {
        const bikeStation = { bikeRentalStation: true } as unknown as Place
        const nonBikeStation = { bikeRentalStation: false } as unknown as Place

        expect(isBikeRentalLeg({ fromPlace: nonBikeStation, toPlace: bikeStation } as Leg)).toBeFalsy()
        expect(isBikeRentalLeg({ fromPlace: bikeStation, toPlace: nonBikeStation } as Leg)).toBeFalsy()
        expect(isBikeRentalLeg({ fromPlace: bikeStation, toPlace: bikeStation } as Leg)).toBeTruthy()

    })
})
