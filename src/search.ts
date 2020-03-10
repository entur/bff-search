import createEnturService, { getTripPatternsQuery, LegMode, TripPattern, QueryMode } from '@entur/sdk'
import { addHours, differenceInHours, setHours, setMinutes, isSameDay } from 'date-fns'

import { SearchParams, TransitTripPatterns, NonTransitTripPatterns, GraphqlQuery } from '../types'

import { TAXI_LIMITS } from './constants'
import {
    hoursBetweenDateAndTripPattern,
    isBikeRentalAlternative,
    isFlexibleAlternative,
    isValidTransitAlternative,
    isValidTaxiAlternative,
    isValidNonTransitDistance,
    parseTripPattern,
} from './utils/tripPattern'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: process.env.JOURNEY_PLANNER_HOST,
    },
})

export async function searchTransitWithTaxi(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<TransitTripPatterns> {
    const [transitResults, nonTransitResults] = await Promise.all([
        searchTransit(params, extraHeaders),
        searchNonTransit(params, extraHeaders),
    ])
    const tripPatterns = transitResults.tripPatterns
    const carPattern = nonTransitResults.car
    const tripPatternsWithTaxi = shouldSearchWithTaxi(params, tripPatterns[0], nonTransitResults)
        ? await searchTaxiFrontBack(params, carPattern, extraHeaders)
        : []

    return {
        ...transitResults,
        tripPatterns: [...tripPatterns, ...tripPatternsWithTaxi],
    }
}

export async function searchTransit(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
    prevQueries?: GraphqlQuery[],
): Promise<TransitTripPatterns> {
    const { initialSearchDate, searchFilter, ...searchParams } = params
    const { searchDate } = searchParams

    const getTripPatternsParams = {
        ...searchParams,
        useFlex: true,
        maxPreTransitWalkDistance: 2000,
    }

    const response = await sdk.getTripPatterns(getTripPatternsParams, { headers: extraHeaders })

    const query = getTripPatternsQuery(getTripPatternsParams)
    const queries = [...(prevQueries || []), query]

    const tripPatterns = response.map(parseTripPattern).filter(isValidTransitAlternative)
    const isSameDaySearch = isSameDay(searchDate, initialSearchDate)

    if (!tripPatterns.length && isSameDaySearch) {
        const nextSearchParams = getNextSearchParams(params)
        return searchTransit(nextSearchParams, extraHeaders, queries)
    }

    return {
        tripPatterns,
        hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
        isSameDaySearch, // TODO 2020-03-09: Deprecated! For compatibility with older app versions we need to keep returning isSameDaySearch for a while. See https://bitbucket.org/enturas/entur-clients/pull-requests/4167
        queries,
    }
}

export async function searchNonTransit(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<NonTransitTripPatterns> {
    const modes = [LegMode.FOOT, LegMode.BICYCLE, LegMode.CAR]

    const [foot, bicycle, car] = await Promise.all(
        modes.map(async mode => {
            const result = await sdk.getTripPatterns(
                {
                    ...params,
                    limit: 1,
                    modes: [mode],
                    maxPreTransitWalkDistance: 2000,
                },
                { headers: extraHeaders },
            )

            const tripPattern = result[0]

            return tripPattern && isValidNonTransitDistance(tripPattern, mode)
                ? parseTripPattern(tripPattern)
                : undefined
        }),
    )

    return { foot, bicycle, car }
}

export async function searchBikeRental(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<TripPattern | undefined> {
    const response = await sdk.getTripPatterns(
        {
            ...params,
            limit: 5,
            modes: [LegMode.BICYCLE, LegMode.FOOT],
            maxPreTransitWalkDistance: 2000,
            allowBikeRental: true,
        },
        { headers: extraHeaders },
    )

    const tripPattern = (response || []).filter(isBikeRentalAlternative)[0]

    return tripPattern && isValidNonTransitDistance(tripPattern, 'bicycle') ? parseTripPattern(tripPattern) : undefined
}

async function searchTaxiFrontBack(
    params: SearchParams,
    carPattern?: TripPattern,
    extraHeaders?: { [key: string]: string },
): Promise<TripPattern[]> {
    const { initialSearchDate, modes: initialModes = [], ...searchParams } = params
    const modes: QueryMode[] = ['car_pickup', 'car_dropoff']

    const [pickup, dropoff] = await Promise.all(
        modes.map(async mode => {
            const response = await sdk.getTripPatterns(
                {
                    ...searchParams,
                    limit: 1,
                    maxPreTransitWalkDistance: 2000,
                    modes: [...initialModes, mode],
                },
                { headers: extraHeaders },
            )

            if (!response?.length) return []

            return response.map(parseTripPattern).filter(isValidTaxiAlternative(initialSearchDate, carPattern))
        }),
    )

    return [...pickup, ...dropoff]
}

function getNextSearchParams(params: SearchParams): SearchParams {
    const { arriveBy, initialSearchDate, searchDate } = params
    const nextDate = getNextSearchDate(Boolean(arriveBy), initialSearchDate, searchDate)

    return { ...params, searchDate: nextDate }
}

function getNextSearchDate(arriveBy: boolean, initialDate: Date, searchDate: Date): Date {
    const hoursSinceInitialSearch = Math.abs(differenceInHours(initialDate, searchDate))
    const sign = arriveBy ? -1 : 1
    const searchDateOffset = hoursSinceInitialSearch === 0 ? sign * 2 : sign * hoursSinceInitialSearch * 3
    const nextSearchDate = addHours(searchDate, searchDateOffset)

    if (isSameDay(nextSearchDate, initialDate)) return nextSearchDate

    return arriveBy ? setMinutes(setHours(nextSearchDate, 23), 59) : setMinutes(setHours(nextSearchDate, 0), 1)
}

function shouldSearchWithTaxi(
    params: SearchParams,
    tripPattern: TripPattern | undefined,
    { foot, car }: NonTransitTripPatterns,
): boolean {
    if (!tripPattern) return true
    if (foot && foot.duration < TAXI_LIMITS.FOOT_ALTERNATIVE_MIN_SECONDS) return false
    if (car && car.duration < TAXI_LIMITS.CAR_ALTERNATIVE_MIN_SECONDS) return false

    const { initialSearchDate, arriveBy } = params
    const hoursBetween = hoursBetweenDateAndTripPattern(initialSearchDate, tripPattern, arriveBy)

    return hoursBetween >= TAXI_LIMITS.DURATION_MAX_HOURS
}
