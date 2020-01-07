import EnturService from '@entur/sdk'

import {
    parseTripPattern, isTransitAlternative, isFlexibleTripsInCombination, isFlexibleAlternative, isBikeRentalAlternative
} from './utils'
import {
    LEG_MODE, NON_TRANSIT_DISTANCE_LIMITS
} from './constants'

const sdk = new EnturService({
    clientName: 'entur-search',
    hosts: {
        journeyplanner: 'https://api.dev.entur.io/sales/v1/offers/search'
    }
})

export async function searchTransit(params) {
    const { from, to, ...searchParams } = params

    const response = await sdk.getTripPatterns(from, to, searchParams)
    const tripPatterns = response
        .map(parseTripPattern)
        .filter(isTransitAlternative)
        .filter(isFlexibleTripsInCombination)

    return {
        tripPatterns,
        hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
    }
}

export const searchNonTransit = async function nontransit(params) {
    const { from, to, ...searchParams } = params
    const modes = [LEG_MODE.FOOT, LEG_MODE.BICYCLE, LEG_MODE.CAR]

    const [foot, bicycle, car] = await Promise.all(modes.map(async mode => {
        const result = await sdk.getTripPatterns(from, to, {
            ...searchParams,
            numTripPatterns: 1,
            modes: [mode],
            maxPreTransitWalkDistance: 2000,
        })

        if (!result || !result.length) return

        const tripPattern = result[0]
        const upperLimit = NON_TRANSIT_DISTANCE_LIMITS.UPPER[mode]
        const lowerLimit = NON_TRANSIT_DISTANCE_LIMITS.LOWER[mode]

        if (tripPattern.distance > upperLimit || tripPattern.distance < lowerLimit) return

        return parseTripPattern(tripPattern)
    }))

    return { foot, bicycle, car }
}

export async function searchBikeRental(params) {
    const { from, to, ...searchParams } = params

    const result = await sdk.getTripPatterns(from, to, {
        ...searchParams,
        numTripPatterns: 5,
        modes: [LEG_MODE.BICYCLE, LEG_MODE.FOOT],
        maxPreTransitWalkDistance: 2000,
        allowBikeRental: true,
    })
    const tripPattern = result.filter(isBikeRentalAlternative)[0]
    const upperLimit = NON_TRANSIT_DISTANCE_LIMITS.UPPER.bicycle
    const lowerLimit = NON_TRANSIT_DISTANCE_LIMITS.LOWER.bicycle

    if (tripPattern.distance > upperLimit || tripPattern.distance < lowerLimit) return

    return parseTripPattern(tripPattern)
}

function shouldSearchWithTaxi(tripPatterns, nonTransitTripPatterns) {
    if (!tripPatterns.length) return true

    const { walk, car } = nonTransitTripPatterns

    if (walk && walk.duration < THRESHOLD.TAXI_WALK) return false
    if (car && car.duration < THRESHOLD.TAXI_CAR) return false

    const timeUntilResult = timeBetweenSearchDateAndResult(originalSearchTime, tripPatterns[0], timepickerMode)

    return timeUntilResult >= THRESHOLD.TAXI_HOURS
}
