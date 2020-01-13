import EnturService, { LegMode, TripPattern, QueryMode } from '@entur/sdk'
import {
    addHours, differenceInHours, setHours, setMinutes, isSameDay,
} from 'date-fns'

import {
    SearchParams, TransitTripPatterns, NonTransitTripPatterns,
} from '../types'

import { TAXI_LIMITS } from './constants'
import {
    hoursbetweenDateAndTripPattern, isBikeRentalAlternative, isFlexibleAlternative,
    isValidTransitAlternative, isValidTaxiAlternative, isValidNonTransitDistance, parseTripPattern,
} from './utils/tripPattern'

const sdk = new EnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: 'https://api.dev.entur.io/sales/v1/offers/search',
    },
})

export async function searchTransitAndTaxi(params: SearchParams): Promise<TransitTripPatterns> {
    const [transitTripPatterns, nonTransitTripPatterns] = await Promise.all([
        searchTransit(params), searchNonTransit(params),
    ])
    const firstTransitPattern = transitTripPatterns.tripPatterns[0]
    const carPattern = nonTransitTripPatterns.car
    const tripPatternsWithTaxi = shouldSearchWithTaxi(params, firstTransitPattern, nonTransitTripPatterns)
        ? await searchTaxiFrontBack(params, carPattern)
        : []

    return {
        ...transitTripPatterns,
        tripPatterns: [
            ...transitTripPatterns.tripPatterns,
            ...tripPatternsWithTaxi,
        ],
    }
}

export async function searchTransit(params: SearchParams): Promise<TransitTripPatterns> {
    const { from, to, initialSearchDate, ...searchParams } = params
    const { searchDate } = searchParams

    const response = await sdk.getTripPatterns(from, to, {
        ...searchParams,
        maxPreTransitWalkDistance: 2000,
    })
    const tripPatterns = response
        .map(parseTripPattern)
        .filter(isValidTransitAlternative)

    if (!tripPatterns.length && isSameDay(searchDate, initialSearchDate)) {
        const nextSearchParams = getNextSearchParams(params)

        return searchTransit(nextSearchParams)
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
            maxPreTransitWalkDistance: 2000,
        })

        if (!result?.length) return

        const tripPattern = result[0]

        return isValidNonTransitDistance(tripPattern, mode)
            ? parseTripPattern(tripPattern)
            : undefined
    }))

    return { foot, bicycle, car }
}

export async function searchTaxiFrontBack(params: SearchParams, carPattern?: TripPattern): Promise<TripPattern[]> {
    const { from, to, initialSearchDate, ...searchParams } = params
    const modes: QueryMode[] = ['car_pickup', 'car_dropoff']

    const [pickup, dropoff] = await Promise.all(modes.map(async mode => {
        const response = await sdk.getTripPatterns(from, to, {
            ...searchParams,
            limit: 1,
            maxPreTransitWalkDistance: 2000,
            modes: [...searchParams.modes, mode],
        })

        if (!response?.length) return []

        return response
            .map(parseTripPattern)
            .filter(isValidTaxiAlternative(initialSearchDate, carPattern))
    }))

    return [...pickup, ...dropoff]
}

export async function searchBikeRental(params: SearchParams): Promise<TripPattern | void> {
    const { from, to, ...searchParams } = params

    const response = await sdk.getTripPatterns(from, to, {
        ...searchParams,
        limit: 5,
        modes: [LegMode.BICYCLE, LegMode.FOOT],
        maxPreTransitWalkDistance: 2000,
        allowBikeRental: true,
    })

    if (!response?.length) return undefined

    const tripPattern = response.filter(isBikeRentalAlternative)[0]

    return isValidNonTransitDistance(tripPattern, 'bicycle')
        ? parseTripPattern(tripPattern)
        : undefined
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

function shouldSearchWithTaxi(params: SearchParams, tripPattern: TripPattern | void, { foot, car }: NonTransitTripPatterns) {
    if (!tripPattern) return true
    if (foot && foot.duration < TAXI_LIMITS.FOOT_ALTERNATIVE_MIN_SECONDS) return false
    if (car && car.duration < TAXI_LIMITS.CAR_ALTERNATIVE_MIN_SECONDS) return false

    const { initialSearchDate, arriveBy } = params
    const hoursBetween = hoursbetweenDateAndTripPattern(initialSearchDate, tripPattern, arriveBy)

    return hoursBetween >= TAXI_LIMITS.DURATION_MAX_HOURS
}
