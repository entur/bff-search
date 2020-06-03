import createEnturService, { getTripPatternsQuery, LegMode, TripPattern, QueryMode, Leg } from '@entur/sdk'
import { set, addHours, subHours, differenceInHours } from 'date-fns'

import { SearchParams, TransitTripPatterns, NonTransitTripPatterns, GraphqlQuery } from '../../types'

import {
    isBikeRentalAlternative,
    isFlexibleAlternative,
    isValidTransitAlternative,
    isValidTaxiAlternative,
    isValidNonTransitDistance,
    isCarAlternative,
    createParseTripPattern,
} from '../utils/tripPattern'
import { sortBy } from '../utils/array'
import { convertToTimeZone } from '../utils/time'

import { TRANSIT_HOST, NON_TRANSIT_HOST } from '../config'

const sdkTransit = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: TRANSIT_HOST,
    },
})

const sdkNonTransit = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: NON_TRANSIT_HOST,
    },
})

function isSameNorwegianDate(dateA: Date, dateB: Date): boolean {
    const norwegianA = convertToTimeZone(dateA, { timeZone: 'Europe/Oslo' })
    const norwegianB = convertToTimeZone(dateB, { timeZone: 'Europe/Oslo' })
    return norwegianA.getDate() === norwegianB.getDate()
}

export async function searchTransitWithTaxi(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<TransitTripPatterns> {
    const [transitResults, nonTransitResults, patternsWithTaxi] = await Promise.all([
        searchTransit(params, extraHeaders),
        searchNonTransit(params, extraHeaders, [LegMode.CAR]),
        searchTaxiFrontBack(params, extraHeaders),
    ])

    const transitPatterns = transitResults.tripPatterns
    const carPattern = nonTransitResults.car

    const validTaxiPatterns = patternsWithTaxi.filter(
        isValidTaxiAlternative(params.initialSearchDate, carPattern, Boolean(params.arriveBy)),
    )

    let tripPatterns = sortBy<TripPattern, string>(
        [...validTaxiPatterns, ...transitPatterns],
        (tripPattern) => tripPattern.endTime,
        params.arriveBy ? 'desc' : 'asc',
    )

    const firstNonTaxiIndex = tripPatterns.findIndex((pattern) => !isCarAlternative(pattern))

    tripPatterns = tripPatterns.filter((pattern, index) => index <= firstNonTaxiIndex || !isCarAlternative(pattern))

    return { ...transitResults, tripPatterns }
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
        maxPreTransitWalkDistance: 2000,
    }

    const response = await sdkTransit.getTripPatterns(getTripPatternsParams, { headers: extraHeaders })

    const query = getTripPatternsQuery(getTripPatternsParams)
    const queries = [...(prevQueries || []), query]
    const parseTripPattern = createParseTripPattern()

    const tripPatterns = response.map(parseTripPattern).filter(isValidTransitAlternative)
    const isSameDaySearch = isSameNorwegianDate(searchDate, initialSearchDate)

    if (!tripPatterns.length && isSameDaySearch) {
        const nextSearchParams = getNextSearchParams(params)
        return searchTransit(nextSearchParams, extraHeaders, queries)
    }

    return {
        tripPatterns,
        hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
        queries,
    }
}

type NonTransitMode = 'foot' | 'bicycle' | 'car' | 'bicycle_rent'

export async function searchNonTransit(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
    modes: NonTransitMode[] = [LegMode.FOOT, LegMode.BICYCLE, LegMode.CAR, 'bicycle_rent'],
): Promise<NonTransitTripPatterns> {
    const parseTripPattern = createParseTripPattern()

    const results = await Promise.all(
        modes.map(async (mode) => {
            const result = await sdkNonTransit.getTripPatterns(
                {
                    ...params,
                    limit: mode === 'bicycle_rent' ? 3 : 1,
                    modes: mode === 'bicycle_rent' ? [LegMode.FOOT, LegMode.BICYCLE] : [mode],
                    maxPreTransitWalkDistance: 2000,
                    allowBikeRental: mode === 'bicycle_rent',
                },
                { headers: extraHeaders },
            )

            const candidate = result.find(({ legs }) => {
                const modeToCheck = mode === 'bicycle_rent' ? LegMode.BICYCLE : mode

                const matchesMode = (leg: Leg): boolean =>
                    leg.mode === modeToCheck && leg.rentedBike === (mode === 'bicycle_rent')

                const matchesModes =
                    legs.some(matchesMode) && legs.every((leg) => leg.mode === LegMode.FOOT || matchesMode(leg))

                return matchesModes
            })

            const tripPattern =
                candidate &&
                isValidNonTransitDistance(candidate, mode) &&
                (mode !== 'bicycle_rent' || isBikeRentalAlternative(candidate))
                    ? parseTripPattern(candidate)
                    : undefined

            return { mode, tripPattern }
        }),
    )

    return results.reduce(
        (acc, { mode, tripPattern }) => ({
            ...acc,
            [mode]: tripPattern,
        }),
        {},
    )
}

async function searchTaxiFrontBack(
    params: SearchParams,
    extraHeaders?: { [key: string]: string },
): Promise<TripPattern[]> {
    const { initialSearchDate, modes: initialModes = [], ...searchParams } = params
    const modes: QueryMode[] = ['car_pickup', 'car_dropoff']
    const parseTripPattern = createParseTripPattern()

    const [pickups, dropoffs] = await Promise.all(
        modes.map(async (mode) => {
            const response = await sdkTransit.getTripPatterns(
                {
                    ...searchParams,
                    limit: 1,
                    maxPreTransitWalkDistance: 2000,
                    modes: [...initialModes, mode],
                },
                { headers: extraHeaders },
            )

            if (!response?.length) return []

            return response.map(parseTripPattern)
        }),
    )

    return [...pickups, ...dropoffs]
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
    const nextSearchDate = addHours(initialDate, searchDateOffset)

    if (isSameNorwegianDate(nextSearchDate, initialDate)) {
        return nextSearchDate
    }

    const norwegianDate = convertToTimeZone(nextSearchDate, { timeZone: 'Europe/Oslo' })

    const next = set(nextSearchDate, {
        year: norwegianDate.getFullYear(),
        month: norwegianDate.getMonth(),
        date: norwegianDate.getDate(),
        hours: arriveBy ? 23 : 0,
        minutes: arriveBy ? 59 : 1,
        seconds: 0,
        milliseconds: 0,
    })

    const tzOffset = differenceInHours(norwegianDate, nextSearchDate)
    return subHours(next, tzOffset)
}
