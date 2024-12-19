import { differenceInHours, parseISO } from 'date-fns'

import { TAXI_LIMITS } from '../constants'
import { GetTripPatternsQuery, Mode } from '../generated/graphql'

import { isFlexibleLeg, isTransitLeg } from './leg'

type TripPattern = GetTripPatternsQuery['trip']['tripPatterns'][0]

export function isTransitAlternative({ legs }: TripPattern): boolean {
    return (legs || []).some(isTransitLeg)
}

export function isValidTaxiAlternative(
    searchDate: Date,
    carPattern: TripPattern | undefined,
    arriveBy: boolean,
): (taxiPattern: TripPattern) => boolean {
    return (taxiPattern: TripPattern) =>
        isTaxiAlternative(taxiPattern) &&
        isFlexibleTripsInCombination(taxiPattern) &&
        isTaxiAlternativeBetterThanCarAlternative(taxiPattern, carPattern) &&
        hoursBetweenDateAndTripPattern(searchDate, taxiPattern, arriveBy) <
            TAXI_LIMITS.DURATION_MAX_HOURS
}

export function hoursBetweenDateAndTripPattern(
    date: Date,
    tripPattern: TripPattern,
    arriveBy: boolean,
): number {
    const tripPatternDate = parseISO(
        arriveBy ? tripPattern.expectedEndTime : tripPattern.expectedStartTime,
    )

    return Math.abs(differenceInHours(tripPatternDate, date))
}

function isTaxiAlternativeBetterThanCarAlternative(
    { legs }: TripPattern,
    carPattern?: TripPattern,
): boolean {
    const taxiLeg = legs.find((leg) => leg?.mode === Mode.Car)

    if (!taxiLeg || typeof taxiLeg.duration !== 'number') return true

    const taxiDuration = taxiLeg.duration || 0

    return (
        taxiDuration > TAXI_LIMITS.DURATION_MIN_SECONDS &&
        (!carPattern?.duration || taxiDuration < carPattern.duration)
    )
}

function isTaxiAlternative(tripPattern: TripPattern): boolean {
    return isCarAlternative(tripPattern) && !isCarOnlyAlternative(tripPattern)
}

function isFlexibleTripsInCombination({ legs }: TripPattern): boolean {
    if (!legs.some(isFlexibleLeg)) return true

    const transitLegs = legs.filter(isTransitLeg)

    return (
        transitLegs[0] !== undefined &&
        transitLegs.length === 1 &&
        isFlexibleLeg(transitLegs[0])
    )
}

function isCarAlternative({ legs }: TripPattern): boolean {
    return (legs || []).some(({ mode }) => mode === Mode.Car)
}

function isCarOnlyAlternative({ legs }: TripPattern): boolean {
    return Boolean(legs?.length) && legs.every(({ mode }) => mode === Mode.Car)
}
