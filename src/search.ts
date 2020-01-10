import EnturService, { LegMode, TripPattern } from '@entur/sdk'
import {
    addHours, differenceInHours, setHours, setMinutes, isSameDay,
} from 'date-fns'

import {
    SearchParams, SearchResults, TransitTripPatterns, NonTransitTripPatterns,
} from '../types'

import {
    NON_TRANSIT_DISTANCE_LIMITS, THRESHOLD,
} from './constants'
import {
    hoursbetweenDateAndTripPattern, isBikeRentalAlternative, isFlexibleAlternative, isFlexibleTripsInCombination,
    isTransitAlternative, isAcceptableTaxiAlternative, isTaxiAlternativeBetterThanCarAlternative, parseTripPattern,
} from './utils/tripPattern'

const sdk = new EnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: 'https://api.dev.entur.io/sales/v1/offers/search',
    },
})

export async function search(params: SearchParams): Promise<SearchResults> {
    const [transitOnlyTripPatterns, nonTransitTripPatterns] = await Promise.all([
        searchTransit(params), searchNonTransit(params),
    ])

    const firstTransitPattern = transitOnlyTripPatterns.tripPatterns[0]
    const carPattern = nonTransitTripPatterns.car

    console.log('firstTransitPattern :', JSON.stringify(firstTransitPattern, undefined, 3))

    const tripPatternsWithTaxi = shouldSearchWithTaxi(params, firstTransitPattern, nonTransitTripPatterns)
        ? await searchTaxiFrontBack(params)
        : []

    console.log('tripPatternsWithTaxi :', JSON.stringify(tripPatternsWithTaxi, undefined, 3))

    const filteredTaxiPatterns = tripPatternsWithTaxi.filter(isTaxiAlternativeBetterThanCarAlternative(carPattern))

    console.log('filteredTaxiPatterns :', JSON.stringify(filteredTaxiPatterns, undefined, 3))

    const transitTripPatterns = {
        ...transitOnlyTripPatterns,
        tripPatterns: [
            ...transitOnlyTripPatterns.tripPatterns,
            ...tripPatternsWithTaxi,
        ],
    }

    return { transitTripPatterns, nonTransitTripPatterns }
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
        .filter(isTransitAlternative)
        .filter(isFlexibleTripsInCombination)

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

export async function searchTaxiFrontBack(params: SearchParams): Promise<TripPattern[]> {
    const { from, to, ...searchParams } = params
    const modes = ['car_pickup', 'car_dropoff']

    const [pickup, dropoff] = await Promise.all(modes.map(async mode => {
        const response = await sdk.getTripPatterns(from, to, {
            ...searchParams,
            limit: 1,
            maxPreTransitWalkDistance: 2000,

            // TODO: Må fikses i SDK-en. Bør ikke bruke LegMode
            // @ts-ignore
            modes: [...searchParams.modes, mode],
        })

        if (!response || !response.length) return

        return response
            .filter(isAcceptableTaxiAlternative(params.initialSearchDate))
            .map(parseTripPattern)
            .filter(isFlexibleTripsInCombination)
    }))

    return [...pickup, ...dropoff]
}

export async function searchBikeRental(params: SearchParams): Promise<TripPattern> {
    const { from, to, ...searchParams } = params

    const result = await sdk.getTripPatterns(from, to, {
        ...searchParams,
        limit: 5,
        modes: [LegMode.BICYCLE, LegMode.FOOT],
        maxPreTransitWalkDistance: 2000,
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

function shouldSearchWithTaxi(params: SearchParams, tripPattern: TripPattern | void, { foot, car }: NonTransitTripPatterns) {
    if (!tripPattern) return true
    if (foot && foot.duration < THRESHOLD.TAXI_WALK) return false
    if (car && car.duration < THRESHOLD.TAXI_CAR) return false

    const { initialSearchDate, arriveBy } = params
    const hoursBetween = hoursbetweenDateAndTripPattern(initialSearchDate, tripPattern, arriveBy)

    return hoursBetween >= THRESHOLD.TAXI_HOURS
}
