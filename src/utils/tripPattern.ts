import { LegMode, TripPattern } from '@entur/sdk'
import { v4 as uuid } from 'uuid'
import { differenceInHours, parseISO } from 'date-fns'

import { TAXI_LIMITS } from '../constants'

import { parseLeg, isFlexibleLeg, isTransitLeg } from './leg'

function isTransitAlternative({ legs }: TripPattern): boolean {
    return (legs || []).some(isTransitLeg)
}

export function isValidTransitAlternative(pattern: TripPattern): boolean {
    return (
        isTransitAlternative(pattern) && isFlexibleTripsInCombination(pattern)
    )
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

export function createParseTripPattern(): (rawTripPattern: any) => TripPattern {
    let i = 0
    const sharedId = uuid()
    const baseId = sharedId.substring(0, 23)
    const iterator = parseInt(sharedId.substring(24), 16)

    return (rawTripPattern: any): TripPattern => {
        i++
        const id = `${baseId}-${(iterator + i).toString(16).slice(-12)}`
        return parseTripPattern({ id, ...rawTripPattern })
    }
}

function parseTripPattern(rawTripPattern: any): TripPattern {
    return {
        ...rawTripPattern,
        id: rawTripPattern.id || uuid(),
        legs: rawTripPattern.legs.map(parseLeg),
        genId: `${new Date().getTime()}:${Math.random()
            .toString(36)
            .slice(2, 12)}`,
    }
}

export function hoursBetweenDateAndTripPattern(
    date: Date,
    tripPattern: TripPattern,
    arriveBy: boolean,
): number {
    const tripPatternDate = parseISO(
        arriveBy ? tripPattern.endTime : tripPattern.startTime,
    )

    return Math.abs(differenceInHours(tripPatternDate, date))
}

function isTaxiAlternativeBetterThanCarAlternative(
    { legs }: TripPattern,
    carPattern?: TripPattern,
): boolean {
    const taxiLeg = legs.find(({ mode }) => mode === LegMode.CAR)

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
    return (legs || []).some(({ mode }) => mode === LegMode.CAR)
}

function isCarOnlyAlternative({ legs }: TripPattern): boolean {
    return (
        Boolean(legs?.length) && legs.every(({ mode }) => mode === LegMode.CAR)
    )
}
