import {
    isBicycle, isCar, isFoot,
    Leg, TripPattern,
} from '@entur/sdk'

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

export function parseTripPattern(rawTripPattern: any): TripPattern {
    return {
        ...rawTripPattern,
        legs: rawTripPattern.legs.map(parseLeg),
        genId: `${new Date().getTime()}:${Math.random().toString(36).slice(2, 12)}`,
    }
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

function isFlexibleLeg({ line }: Leg): boolean {
    return line?.flexibleLineType === 'flexibleAreasOnly'
}

function isTransitLeg({ mode }: Leg): boolean {
    return !isFoot(mode) && !isBicycle(mode) && !isCar(mode)
}

function isBikeRentalLeg(leg: any): boolean {
    return Boolean(leg.fromPlace?.bikeRentalStation && leg.toPlace?.bikeRentalStation)
}
