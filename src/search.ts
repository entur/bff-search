import EnturService, { LegMode, TripPattern } from '@entur/sdk'

import { SearchParams } from '../types'

import { NON_TRANSIT_DISTANCE_LIMIT } from './utils/constants'

import {
    isBikeRentalAlternative, isFlexibleAlternative, isFlexibleTripsInCombination,
    isTransitAlternative, parseTripPattern,
} from './utils/tripPattern'

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
        const upperLimit = NON_TRANSIT_DISTANCE_LIMIT.UPPER[mode]
        const lowerLimit = NON_TRANSIT_DISTANCE_LIMIT.LOWER[mode]

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
    const upperLimit = NON_TRANSIT_DISTANCE_LIMIT.UPPER.bicycle
    const lowerLimit = NON_TRANSIT_DISTANCE_LIMIT.LOWER.bicycle

    if (tripPattern.distance > upperLimit || tripPattern.distance < lowerLimit) return

    return parseTripPattern(tripPattern)
}
