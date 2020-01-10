import {
    isBicycle, isCar, isFoot, LegMode,
    Leg, TripPattern,
} from '@entur/sdk'
import { differenceInHours, parseJSON } from 'date-fns'

import { THRESHOLD } from '../constants'

export function isTransitAlternative({ legs }: TripPattern ): boolean {
    return (legs || []).some(isTransitLeg)
}

export function isBikeRentalAlternative({ legs }: TripPattern ): boolean {
    return (legs || []).some(isBikeRentalLeg)
}

export function isFlexibleAlternative({ legs }: TripPattern ): boolean {
    return (legs || []).some(isFlexibleLeg)
}

export function isFlexibleTripsInCombination({ legs }: TripPattern ): boolean {
    if (!legs.some(isFlexibleLeg)) return true

    const transitLegs = legs.filter(isTransitLeg)

    return transitLegs.length === 1 && isFlexibleLeg(transitLegs[0])
}

export function isAcceptableTaxiAlternative(searchDate: Date): (taxiPattern: TripPattern) => boolean {
    return (taxiPattern: TripPattern) => {
        return isTaxiFrontBackAlternative(taxiPattern)
            && hoursbetweenDateAndTripPattern(searchDate, taxiPattern) < THRESHOLD.TAXI_HOURS
    }
}

export function isTaxiAlternativeBetterThanCarAlternative(carPattern?: TripPattern): (taxiPattern: TripPattern) => boolean {
    return ({ legs }) => {
        const taxiLeg = legs.find(({ mode }) => mode === LegMode.CAR)

        if (!taxiLeg || typeof taxiLeg.duration !== 'number') return true

        const taxiDuration = taxiLeg.duration || 0

        return taxiDuration > 5 * 60 && (!carPattern.duration || taxiDuration < carPattern.duration)
    }
}

export function parseTripPattern(rawTripPattern: any): TripPattern {
    return {
        ...rawTripPattern,
        legs: rawTripPattern.legs.map(parseLeg),
        genId: `${new Date().getTime()}:${Math.random().toString(36).slice(2, 12)}`,
    }
}

export function hoursbetweenDateAndTripPattern(date: Date, tripPattern: TripPattern, arriveBy?: boolean): number {
    const tripPatternDate = parseJSON(arriveBy ? tripPattern.endTime : tripPattern.startTime)

    return Math.abs(differenceInHours(tripPatternDate, date))
}

function parseLeg(leg: any): Leg {
    const { fromPlace, fromEstimatedCall } = leg
    const fromQuayName = fromPlace?.quay?.name || fromEstimatedCall?.quay?.name

    if (!isFlexibleLeg(leg) && fromQuayName) {
        return {
            ...leg,
            fromPlace: {
                ...fromPlace,
                name: isTransitLeg(leg) ? fromQuayName : fromPlace.name,
            },
        }
    }
    return leg
}

function isTaxiFrontBackAlternative(tripPattern: TripPattern): boolean {
    return isCarAlternative(tripPattern) && !isCarOnlyAlternative(tripPattern)
}

function isCarAlternative({ legs }: TripPattern): boolean {
    return (legs || []).some(({ mode }) => isCar(mode))
}

function isCarOnlyAlternative({ legs }: TripPattern): boolean {
    return legs?.length && legs.every(({ mode }) => isCar(mode))
}

function isFlexibleLeg({ line }: Leg): boolean {
    return line?.flexibleLineType === 'flexibleAreasOnly'
}

function isTransitLeg({ mode }: Leg): boolean {
    return !isFoot(mode) && !isBicycle(mode) && !isCar(mode)
}

function isBikeRentalLeg(leg: any): boolean {
    return Boolean(leg.fromPlace?.bikeRentalStation && leg.toPlace?.bikeRentalStation)
}
