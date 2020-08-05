import { addHours, subHours } from 'date-fns'

import { Leg, LegMode, TripPattern } from '@entur/sdk'

import { NON_TRANSIT_DISTANCE_LIMITS } from '../constants'

import {
    isValidTaxiAlternative,
    isValidNonTransitDistance,
    hoursBetweenDateAndTripPattern,
} from './tripPattern'

const now = new Date()

describe('isValidTaxiAlternative', () => {
    function mockLeg({ mode, isFlexible, duration = 0 }: any): Leg {
        return {
            mode,
            line: { flexibleLineType: isFlexible ? 'flexibleAreasOnly' : '' },
            duration,
        } as Leg
    }
    function mockPattern({ startTime, endTime, legs }: any): TripPattern {
        return { startTime, endTime, legs } as TripPattern
    }

    const carPattern = { duration: 999 } as TripPattern
    const isValidTaxi = isValidTaxiAlternative(now, carPattern, false)

    it('should be false unless the given pattern has at least one CAR leg, and one non-CAR leg', () => {
        const onlyMetro = mockPattern({
            legs: [mockLeg({ mode: LegMode.METRO })],
        })
        const metroTaxi = mockPattern({
            legs: [
                mockLeg({ mode: LegMode.METRO }),
                mockLeg({ mode: LegMode.BUS }),
            ],
        })
        const onlyTaxi = mockPattern({ legs: [mockLeg({ mode: LegMode.CAR })] })
        const taxiTaxi = mockPattern({
            legs: [
                mockLeg({ mode: LegMode.CAR }),
                mockLeg({ mode: LegMode.CAR }),
            ],
        })

        expect(isValidTaxi(onlyMetro)).toEqual(false)
        expect(isValidTaxi(metroTaxi)).toEqual(false)
        expect(isValidTaxi(onlyTaxi)).toEqual(false)
        expect(isValidTaxi(taxiTaxi)).toEqual(false)
    })

    it('should be false unless there is exactly one transit leg which is also flexible', () => {
        const oneNonFlexibleTransit = mockPattern({
            legs: [
                mockLeg({ mode: LegMode.METRO, isFlexible: false }),
                mockLeg({ mode: LegMode.CAR, isFlexible: true }),
            ],
        })
        const twoFlexibleTransits = mockPattern({
            legs: [
                mockLeg({ mode: LegMode.RAIL, isFlexible: true }),
                mockLeg({ mode: LegMode.BUS, isFlexible: true }),
                mockLeg({ mode: LegMode.CAR, isFlexible: false }),
            ],
        })

        expect(isValidTaxi(oneNonFlexibleTransit)).toEqual(false)
        expect(isValidTaxi(twoFlexibleTransits)).toEqual(false)
    })

    it('should be false unless the taxi leg exceeds the min duration limit, but still shorter than the given car pattern', () => {
        const tooShortDuration = mockPattern({
            legs: [
                mockLeg({ mode: LegMode.METRO }),
                mockLeg({ mode: LegMode.CAR }),
            ],
        })
        const tooLongDuration = mockPattern({
            legs: [
                mockLeg({ mode: LegMode.METRO }),
                mockLeg({ mode: LegMode.CAR, duration: 1337 }),
            ],
        })

        expect(isValidTaxi(tooShortDuration)).toEqual(false)
        expect(isValidTaxi(tooLongDuration)).toEqual(false)
    })
})

describe('isValidNonTransitDistance', () => {
    function mockPattern(
        mode: 'foot' | 'bicycle' | 'car',
        distanceDelta = 0,
    ): TripPattern {
        return {
            distance: NON_TRANSIT_DISTANCE_LIMITS.UPPER[mode] + distanceDelta,
        } as TripPattern
    }

    it('should be true if the given trip has a distance within the limits of the given mode', () => {
        expect(isValidNonTransitDistance(mockPattern('car'), 'car')).toEqual(
            true,
        )
        expect(isValidNonTransitDistance(mockPattern('foot'), 'foot')).toEqual(
            true,
        )
        expect(
            isValidNonTransitDistance(mockPattern('bicycle'), 'bicycle'),
        ).toEqual(true)
    })

    it('should be false if the given trip has a distance outside the limits of the given mode', () => {
        expect(
            isValidNonTransitDistance(mockPattern('car', 1337), 'car'),
        ).toEqual(false)
        expect(
            isValidNonTransitDistance(mockPattern('foot', 404), 'foot'),
        ).toEqual(false)
        expect(
            isValidNonTransitDistance(mockPattern('bicycle', 42), 'bicycle'),
        ).toEqual(false)
    })
})

describe('hoursBetweenDateAndTripPattern', () => {
    function mockPattern({ startTime = '', endTime = '' }): TripPattern {
        return { endTime, startTime } as TripPattern
    }

    it('should count the hours between the given date and the start of the trip if `arriveBy` is `false`', () => {
        const startsInEightHours = mockPattern({
            startTime: addHours(now, 8).toISOString(),
        })
        const startedTwoHoursAgo = mockPattern({
            startTime: subHours(now, 2).toISOString(),
        })

        expect(
            hoursBetweenDateAndTripPattern(now, startsInEightHours, false),
        ).toEqual(8)
        expect(
            hoursBetweenDateAndTripPattern(now, startedTwoHoursAgo, false),
        ).toEqual(2)
    })

    it('should count the hours between the given date and the end of the trip if `arriveBy` is `true`', () => {
        const endsInElevenHours = mockPattern({
            endTime: addHours(now, 11).toISOString(),
        })
        const endedFourHoursAgo = mockPattern({
            endTime: subHours(now, 4).toISOString(),
        })

        expect(
            hoursBetweenDateAndTripPattern(now, endsInElevenHours, true),
        ).toEqual(11)
        expect(
            hoursBetweenDateAndTripPattern(now, endedFourHoursAgo, true),
        ).toEqual(4)
    })
})
