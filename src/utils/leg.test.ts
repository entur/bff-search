import { Leg, Place } from '../types'
import { Mode } from '../generated/graphql'
import { parseLeg, isFlexibleLeg, isTransitLeg, isBikeRentalLeg } from './leg'

describe('parseLeg', () => {
    it('should map coach legs to bus legs', () => {
        const leg = { mode: Mode.Coach } as Leg

        expect(parseLeg(leg).mode).toEqual(Mode.Bus)
    })

    it('should update the fromPlace name of transit legs', () => {
        const oldName = 'place name'
        const newName = 'quay name'
        const buildLeg = (mode: Mode): Leg =>
            ({
                fromPlace: { name: oldName, quay: { name: newName } },
                mode,
            } as Leg)
        const nonTransitLeg = buildLeg(Mode.Foot)
        const transitLeg = buildLeg(Mode.Rail)

        expect(parseLeg(nonTransitLeg).fromPlace.name).toEqual(oldName)
        expect(parseLeg(transitLeg).fromPlace.name).toEqual(newName)
    })
})

describe('isFlexibleLeg', () => {
    it('should check if the leg has a flexible line type', () => {
        const nonFlexibleLeg = { line: { flexibleLineType: null } } as Leg
        const flexibleLeg = {
            line: { flexibleLineType: 'flexibleAreasOnly' },
        } as Leg

        expect(isFlexibleLeg(nonFlexibleLeg)).toBeFalsy()
        expect(isFlexibleLeg(flexibleLeg)).toBeTruthy()
    })
})

describe('isTransitLeg', () => {
    it('should check if the leg has a transit mode', () => {
        expect(isTransitLeg({ mode: Mode.Rail } as Leg)).toBeTruthy()
        expect(isTransitLeg({ mode: Mode.Air } as Leg)).toBeTruthy()
        expect(isTransitLeg({ mode: Mode.Foot } as Leg)).toBeFalsy()
        expect(isTransitLeg({ mode: Mode.Bicycle } as Leg)).toBeFalsy()
        expect(isTransitLeg({ mode: Mode.Car } as Leg)).toBeFalsy()
        expect(isTransitLeg({ mode: Mode.Tram } as Leg)).toBeTruthy()
    })
})

describe('isBikeRentalLeg', () => {
    it("should check if the leg's from- and to-places are bike rental stations", () => {
        const bikeStation = { bikeRentalStation: true } as unknown as Place
        const nonBikeStation = {
            bikeRentalStation: false,
        } as unknown as Place

        expect(
            isBikeRentalLeg({
                fromPlace: nonBikeStation,
                toPlace: bikeStation,
            } as Leg),
        ).toBeFalsy()
        expect(
            isBikeRentalLeg({
                fromPlace: bikeStation,
                toPlace: nonBikeStation,
            } as Leg),
        ).toBeFalsy()
        expect(
            isBikeRentalLeg({
                fromPlace: bikeStation,
                toPlace: bikeStation,
            } as Leg),
        ).toBeTruthy()
    })
})
