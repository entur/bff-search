import { TripPattern, Leg, Place } from '@entur/sdk'

// Yeah, so... in some cases we get Track 1 at Oslo S even if the train departs from God knows where, just not
// track 1. This makes our customers fairly unhappy, as some of them - strangely enough - do not appreciate running from
// track 1 to track 17 with four bags, two dogs and three screaming kids. Go figure. Anyway, better we
// replace 1 with something that tells the customers that we have NO CLUE where that train departs from.
const replaceQuay1ForOsloSInPlace = (place: Place): Place => {
    if (
        place.quay &&
        place.name === 'Oslo S' &&
        place.quay?.publicCode === '1'
    ) {
        return {
            ...place,
            quay: {
                ...place.quay,
                publicCode: 'ukjent',
            },
        }
    }
    return place
}

const replaceQuay1ForOsloSInLeg = (leg: Leg): Leg => {
    return {
        ...leg,
        fromPlace: replaceQuay1ForOsloSInPlace(leg.fromPlace),
        toPlace: replaceQuay1ForOsloSInPlace(leg.toPlace),
    }
}

export function replaceQuay1ForOsloSWithUnknown<T extends TripPattern>(
    tripPattern: T,
): T {
    return {
        ...tripPattern,
        legs: tripPattern.legs.map(replaceQuay1ForOsloSInLeg),
    }
}
