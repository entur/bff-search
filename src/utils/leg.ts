import {
    isBicycle, isCar, isFoot,
    Leg, LegMode,
} from '@entur/sdk'

export function parseLeg(leg: Leg): Leg {
    const { fromPlace, fromEstimatedCall } = leg
    const fromQuayName = fromPlace?.quay?.name || fromEstimatedCall?.quay?.name
    const parsedLeg = isFlexibleLeg(leg) || !fromQuayName
        ? leg
        : {
            ...leg,
            fromPlace: {
                ...fromPlace,
                name: isTransitLeg(leg) ? fromQuayName : fromPlace.name,
            },
        }

    return coachLegToBusLeg(parsedLeg)
}

export function isFlexibleLeg({ line }: Leg): boolean {
    return line?.flexibleLineType === 'flexibleAreasOnly'
}

export function isTransitLeg({ mode }: Leg): boolean {
    return !isFoot(mode) && !isBicycle(mode) && !isCar(mode)
}

export function isBikeRentalLeg(leg: any): boolean {
    return Boolean(leg.fromPlace?.bikeRentalStation && leg.toPlace?.bikeRentalStation)
}

// Replaces `leg.mode` from the OTP result from `coach` to `bus`.
// In the future we might want to handle buses and coaches differently,
// but for now, all coaches will be treated as buses in the app.
function coachLegToBusLeg(leg: Leg): Leg {
    return {
        ...leg,
        mode: leg.mode === LegMode.COACH ? LegMode.BUS : leg.mode,
    }
}
