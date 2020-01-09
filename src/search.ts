import EnturService, { LegMode, TripPattern } from '@entur/sdk'
import {
    addHours, differenceInHours, setHours, setMinutes, isSameDay,
} from 'date-fns'

import { SearchParams, TransitTripPatterns, NonTransitTripPatterns } from '../types'

import { NON_TRANSIT_DISTANCE_LIMITS } from './utils/constants'
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

export async function searchTransit(params: SearchParams, numRetries: number = 0): Promise<TransitTripPatterns> {
    const { from, to, initialSearchDate, ...searchParams } = params
    const { searchDate } = searchParams

    const response = await sdk.getTripPatterns(from, to, searchParams)
    const tripPatterns = response
        .map(parseTripPattern)
        .filter(isTransitAlternative)
        .filter(isFlexibleTripsInCombination)

    if (!tripPatterns.length && isSameDay(searchDate, initialSearchDate)) {
        const nextSearchParams = getNextSearchParams(params)

        console.log('numRetries :', numRetries);

        return searchTransit(nextSearchParams, numRetries + 1)
    }

    return {
        tripPatterns,
        hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
    }
}

export async function searchNonTransit(params: SearchParams): Promise<NonTransitTripPatterns> {
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

function getNextSearchParams(params: SearchParams): SearchParams {
    const { arriveBy, initialSearchDate, searchDate } = params
    const nextDate = getNextSearchDate(arriveBy, initialSearchDate, searchDate)

    return { ...params, searchDate: nextDate }
}

function getNextSearchDate(arriveBy: boolean, initialDate: Date, searchDate: Date): Date {
    const hoursSinceInitialSearch = Math.abs(differenceInHours(initialDate , searchDate))
    const sign = arriveBy ? -1 : 1
    const searchDateOffset = hoursSinceInitialSearch === 0
        ? sign * 2
        : sign * hoursSinceInitialSearch * 3

    const nextSearchDate = addHours(searchDate, searchDateOffset)

    if (isSameDay(nextSearchDate, initialDate)) return nextSearchDate

    return arriveBy
        ? setMinutes(setHours(nextSearchDate, 23), 59)
        : setMinutes(setHours(nextSearchDate, 0), 1)
}
