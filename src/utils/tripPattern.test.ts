import { addHours, subHours } from 'date-fns'
import { Mode } from '../generated/graphql'

import { Leg, TripPattern } from '../types'

import {
    isValidTaxiAlternative,
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

    it('should be false unless the given pattern has at least one Car leg, and one non-Car leg', () => {
        const onlyMetro = mockPattern({
            legs: [mockLeg({ mode: Mode.Metro })],
        })
        const metroTaxi = mockPattern({
            legs: [mockLeg({ mode: Mode.Metro }), mockLeg({ mode: Mode.Bus })],
        })
        const onlyTaxi = mockPattern({ legs: [mockLeg({ mode: Mode.Car })] })
        const taxiTaxi = mockPattern({
            legs: [mockLeg({ mode: Mode.Car }), mockLeg({ mode: Mode.Car })],
        })

        expect(isValidTaxi(onlyMetro)).toEqual(false)
        expect(isValidTaxi(metroTaxi)).toEqual(false)
        expect(isValidTaxi(onlyTaxi)).toEqual(false)
        expect(isValidTaxi(taxiTaxi)).toEqual(false)
    })

    it('should be false unless there is exactly one transit leg which is also flexible', () => {
        const oneNonFlexibleTransit = mockPattern({
            legs: [
                mockLeg({ mode: Mode.Metro, isFlexible: false }),
                mockLeg({ mode: Mode.Car, isFlexible: true }),
            ],
        })
        const twoFlexibleTransits = mockPattern({
            legs: [
                mockLeg({ mode: Mode.Rail, isFlexible: true }),
                mockLeg({ mode: Mode.Bus, isFlexible: true }),
                mockLeg({ mode: Mode.Car, isFlexible: false }),
            ],
        })

        expect(isValidTaxi(oneNonFlexibleTransit)).toEqual(false)
        expect(isValidTaxi(twoFlexibleTransits)).toEqual(false)
    })

    it('should be false unless the taxi leg exceeds the min duration limit, but still shorter than the given car pattern', () => {
        const tooShortDuration = mockPattern({
            legs: [mockLeg({ mode: Mode.Metro }), mockLeg({ mode: Mode.Car })],
        })
        const tooLongDuration = mockPattern({
            legs: [
                mockLeg({ mode: Mode.Metro }),
                mockLeg({ mode: Mode.Car, duration: 1337 }),
            ],
        })

        expect(isValidTaxi(tooShortDuration)).toEqual(false)
        expect(isValidTaxi(tooLongDuration)).toEqual(false)
    })
})

describe('hoursBetweenDateAndTripPattern', () => {
    function mockPattern({
        expectedStartTime = '',
        expectedEndTime = '',
    }): TripPattern {
        return { expectedEndTime, expectedStartTime } as TripPattern
    }

    it('should count the hours between the given date and the start of the trip if `arriveBy` is `false`', () => {
        const startsInEightHours = mockPattern({
            expectedStartTime: addHours(now, 8).toISOString(),
        })
        const startedTwoHoursAgo = mockPattern({
            expectedStartTime: subHours(now, 2).toISOString(),
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
            expectedEndTime: addHours(now, 11).toISOString(),
        })
        const endedFourHoursAgo = mockPattern({
            expectedEndTime: subHours(now, 4).toISOString(),
        })

        expect(
            hoursBetweenDateAndTripPattern(now, endsInElevenHours, true),
        ).toEqual(11)
        expect(
            hoursBetweenDateAndTripPattern(now, endedFourHoursAgo, true),
        ).toEqual(4)
    })
})
