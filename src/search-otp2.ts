import createEnturService, { getTripPatternsQuery, LegMode, TripPattern } from '@entur/sdk'
import { isSameDay } from 'date-fns'

import {
    SearchParams, TransitTripPatterns, NonTransitTripPatterns, GraphqlQuery,
} from '../types'

import {
    isBikeRentalAlternative, isFlexibleAlternative,
    isValidTransitAlternative, isValidNonTransitDistance, parseTripPattern,
} from './utils/tripPattern'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: process.env.JOURNEY_PLANNER_V3_HOST,
    },
})

export async function searchTransit(
    params: SearchParams,
    extraHeaders: {[key: string]: string},
    prevQueries?: GraphqlQuery[],
): Promise<TransitTripPatterns> {
    const { initialSearchDate, ...searchParams } = params
    const { searchDate } = searchParams

    const getTripPatternsParams = {
        ...searchParams,
        useFlex: true,
        maxPreTransitWalkDistance: 2000,
    }

    const response = await sdk.getTripPatterns(getTripPatternsParams, { headers: extraHeaders })

    const query = getTripPatternsQuery(getTripPatternsParams)
    const queries = [...prevQueries || [], query]

    const tripPatterns = response
        .map(parseTripPattern)
        .filter(isValidTransitAlternative)
    const isSameDaySearch = isSameDay(searchDate, initialSearchDate)

    return {
        tripPatterns,
        hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
        isSameDaySearch,
        queries,
    }
}

export async function searchNonTransit(params: SearchParams, extraHeaders: {[key: string]: string}): Promise<NonTransitTripPatterns> {
    const modes = [LegMode.FOOT, LegMode.BICYCLE, LegMode.CAR]

    const [foot, bicycle, car] = await Promise.all(modes.map(async mode => {
        const result = await sdk.getTripPatterns({
            ...params,
            limit: 1,
            modes: [mode],
            maxPreTransitWalkDistance: 2000,
        }, { headers: extraHeaders })

        const tripPattern = result[0]

        return tripPattern && isValidNonTransitDistance(tripPattern, mode)
            ? parseTripPattern(tripPattern)
            : undefined
    }))

    return { foot, bicycle, car }
}

export async function searchBikeRental(params: SearchParams, extraHeaders: {[key: string]: string}): Promise<TripPattern | undefined> {
    const response = await sdk.getTripPatterns({
        ...params,
        limit: 5,
        modes: [LegMode.BICYCLE, LegMode.FOOT],
        maxPreTransitWalkDistance: 2000,
        allowBikeRental: true,
    }, { headers: extraHeaders })

    const tripPattern = (response || []).filter(isBikeRentalAlternative)[0]

    return tripPattern && isValidNonTransitDistance(tripPattern, 'bicycle')
        ? parseTripPattern(tripPattern)
        : undefined
}
