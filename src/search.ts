import EnturService, {
    LegMode, TripPattern,
 } from '@entur/sdk'

import { SearchParams } from '../index'

import {
    parseTripPattern, isTransitAlternative, isFlexibleTripsInCombination,
    isFlexibleAlternative, isBikeRentalAlternative,
} from './utils'
import { NON_TRANSIT_DISTANCE_LIMITS } from './constants'

const sdk = new EnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: 'https://api.dev.entur.io/sales/v1/offers/search',
    },
})

export async function searchTransit(params: SearchParams) {
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

export async function searchNonTransit(params: SearchParams) {
    const { from, to, ...searchParams } = params
    const modes = [LegMode.FOOT, LegMode.BICYCLE, LegMode.CAR]

    const [foot, bicycle, car] = await Promise.all(modes.map(async mode => {
        const result = await sdk.getTripPatterns(from, to, {
            ...searchParams,
            limit: 1,
            modes: [mode],

            // TODO: typen finnes ikke i SDK-en. Er dette brukt?
            // @ts-ignore
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

export async function searchBikeRental(params: SearchParams): Promise<TripPattern> {
    const { from, to, ...searchParams } = params

    const result = await sdk.getTripPatterns(from, to, {
        ...searchParams,
        limit: 5,
        modes: [LegMode.BICYCLE, LegMode.FOOT],

        // TODO: typen finnes ikke i SDK-en. Er dette brukt?
        // @ts-ignore
        maxPreTransitWalkDistance: 2000,

        // TODO: typen finnes ikke i SDK-en. Er dette brukt?
        // @ts-ignore
        allowBikeRental: true,
    })
    const tripPattern = result.filter(isBikeRentalAlternative)[0]
    const upperLimit = NON_TRANSIT_DISTANCE_LIMITS.UPPER.bicycle
    const lowerLimit = NON_TRANSIT_DISTANCE_LIMITS.LOWER.bicycle

    if (tripPattern.distance > upperLimit || tripPattern.distance < lowerLimit) return

    return parseTripPattern(tripPattern)
}

// TODO: WIP. En del av logikken som må flyttes fra klienten.
/*
function shouldSearchWithTaxi(tripPatterns: [TripPattern], nonTransitTripPatterns: NonTransitTripPatterns): boolean {
    if (!tripPatterns.length) return true

    const { car, foot } = nonTransitTripPatterns

    if (foot && foot.duration < THRESHOLD.TAXI_WALK) return false
    if (car && car.duration < THRESHOLD.TAXI_CAR) return false

    const timeUntilResult = timeBetweenSearchDateAndResult(originalSearchTime, tripPatterns[0], timepickerMode)

    return timeUntilResult >= THRESHOLD.TAXI_HOURS
}
*/
