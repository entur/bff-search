import { Mode } from '../generated/graphql'

import type { Leg } from '../types'

export function parseLeg(leg: Leg): Leg {
    const { fromPlace, fromEstimatedCall } = leg
    const fromQuayName = fromPlace?.quay?.name || fromEstimatedCall?.quay?.name
    const parsedLeg =
        isFlexibleLeg(leg) || !fromQuayName
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

export function isFlexibleLeg(leg: Leg): boolean {
    return leg.line?.flexibleLineType === 'flexibleAreasOnly'
}

export function isTransitLeg(leg: Leg): boolean {
    const { mode } = leg
    return mode !== Mode.Foot && mode !== Mode.Bicycle && mode !== Mode.Car
}

export function isBikeRentalLeg(leg: Leg): boolean {
    return Boolean(
        leg.fromPlace?.bikeRentalStation && leg.toPlace?.bikeRentalStation,
    )
}

// Replaces `leg.mode` from the OTP result from `coach` to `bus`.
// In the future we might want to handle buses and coaches differently,
// but for now, all coaches will be treated as buses in the app.
function coachLegToBusLeg(leg: Leg): Leg {
    return {
        ...leg,
        mode: leg.mode === Mode.Coach ? Mode.Bus : leg.mode,
    }
}
