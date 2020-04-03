import { isCar, LegMode, TripPattern } from '@entur/sdk'
import { differenceInHours, parseJSON } from 'date-fns'

import { NON_TRANSIT_DISTANCE_LIMITS, TAXI_LIMITS } from '../constants'

import { parseLeg, isFlexibleLeg, isTransitLeg, isBikeRentalLeg } from './leg'

export function isTransitAlternative({ legs }: TripPattern): boolean {
    return (legs || []).some(isTransitLeg)
}

export function isBikeRentalAlternative({ legs }: TripPattern): boolean {
    return (legs || []).some(isBikeRentalLeg)
}

export function isFlexibleAlternative({ legs }: TripPattern): boolean {
    return (legs || []).some(isFlexibleLeg)
}

export function isValidTransitAlternative(pattern: TripPattern): boolean {
    return isTransitAlternative(pattern) && isFlexibleTripsInCombination(pattern)
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
        hoursBetweenDateAndTripPattern(searchDate, taxiPattern, arriveBy) < TAXI_LIMITS.DURATION_MAX_HOURS
}

export function isValidNonTransitDistance(
    pattern: TripPattern,
    mode: 'foot' | 'bicycle' | 'bicycle_rent' | 'car',
): boolean {
    return (
        pattern.distance <= NON_TRANSIT_DISTANCE_LIMITS.UPPER[mode] &&
        pattern.distance >= NON_TRANSIT_DISTANCE_LIMITS.LOWER[mode]
    )
}

export function parseTripPattern(rawTripPattern: any): TripPattern {
    return {
        ...rawTripPattern,
        legs: rawTripPattern.legs.map(parseLeg),
        genId: `${new Date().getTime()}:${Math.random().toString(36).slice(2, 12)}`,
    }
}

export function hoursBetweenDateAndTripPattern(date: Date, tripPattern: TripPattern, arriveBy: boolean): number {
    const tripPatternDate = parseJSON(arriveBy ? tripPattern.endTime : tripPattern.startTime)

    return Math.abs(differenceInHours(tripPatternDate, date))
}

function isTaxiAlternativeBetterThanCarAlternative({ legs }: TripPattern, carPattern?: TripPattern): boolean {
    const taxiLeg = legs.find(({ mode }) => mode === LegMode.CAR)

    if (!taxiLeg || typeof taxiLeg.duration !== 'number') return true

    const taxiDuration = taxiLeg.duration || 0

    return (
        taxiDuration > TAXI_LIMITS.DURATION_MIN_SECONDS && (!carPattern?.duration || taxiDuration < carPattern.duration)
    )
}

function isTaxiAlternative(tripPattern: TripPattern): boolean {
    return isCarAlternative(tripPattern) && !isCarOnlyAlternative(tripPattern)
}

function isFlexibleTripsInCombination({ legs }: TripPattern): boolean {
    if (!legs.some(isFlexibleLeg)) return true

    const transitLegs = legs.filter(isTransitLeg)

    return transitLegs.length === 1 && isFlexibleLeg(transitLegs[0])
}

function isCarAlternative({ legs }: TripPattern): boolean {
    return (legs || []).some(({ mode }) => isCar(mode))
}

function isCarOnlyAlternative({ legs }: TripPattern): boolean {
    return Boolean(legs?.length) && legs.every(({ mode }) => isCar(mode))
}
