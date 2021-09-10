import createEnturService, {
    getTripPatternsQuery,
    LegMode,
    TripPattern,
    QueryMode,
    Leg,
} from '@entur/sdk'
import { set, addHours, subHours, differenceInHours } from 'date-fns'

import {
    SearchParams,
    TransitTripPatterns,
    NonTransitTripPatterns,
    GraphqlQuery,
} from '../../types'

import {
    isBikeRentalAlternative,
    isFlexibleAlternative,
    isValidTransitAlternative,
    isValidTaxiAlternative,
    isValidNonTransitDistance,
    createParseTripPattern,
} from '../../utils/tripPattern'
import { sortBy } from '../../utils/array'
import { convertToTimeZone } from '../../utils/time'

import logger from '../../logger'

import { TRANSIT_HOST, NON_TRANSIT_HOST } from '../../config'
import { replaceQuay1ForOsloSWithUnknown } from '../../utils/osloSTrack1Replacer'

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
    const firstTransitResults = await searchTransit(
        params,
        extraHeaders,
        undefined,
        { runOnce: true },
    )

    let { tripPatterns, queries } = firstTransitResults

    const [taxiResults, secondTransitResults]: [
        TripPattern[],
        TransitTripPatterns | undefined,
    ] = await Promise.all([
        !tripPatterns.length ? searchTaxiFrontBack(params, extraHeaders) : [],
        firstTransitResults.nextSearchParams
            ? searchTransit(
                  firstTransitResults.nextSearchParams,
                  extraHeaders,
                  queries,
                  { runOnce: true },
              )
            : undefined,
    ])

    const taxiPatterns = secondTransitResults?.tripPatterns?.length
        ? []
        : taxiResults

    tripPatterns = [
        ...tripPatterns,
        ...taxiPatterns,
        ...(secondTransitResults?.tripPatterns || []),
    ]

    queries = secondTransitResults?.queries || queries

    if (!tripPatterns.length && secondTransitResults?.nextSearchParams) {
        const thirdTransitResults = await searchTransit(
            secondTransitResults.nextSearchParams,
            extraHeaders,
            queries,
        )

        tripPatterns = [...tripPatterns, ...thirdTransitResults.tripPatterns]
        queries = thirdTransitResults.queries
    }

    if (taxiPatterns.length) {
        tripPatterns = sortBy<TripPattern, string>(
            tripPatterns,
            (tripPattern) => tripPattern.endTime,
            params.arriveBy ? 'desc' : 'asc',
        )
    }

    logger.info('searchTransitWithTaxi returning', {
        numberOfQueries: queries.length,
        numberOfTaxiResults: taxiPatterns.length,
        numberOfResults: tripPatterns.length,
    })

    return {
        hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
        tripPatterns,
        queries,
    }
}

export async function searchTransit(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
    prevQueries?: GraphqlQuery[],
    options?: { runOnce?: boolean },
): Promise<TransitTripPatterns> {
    const { initialSearchDate, searchFilter, ...searchParams } = params
    const { searchDate } = searchParams

    const getTripPatternsParams = {
        ...searchParams,
        maxPreTransitWalkDistance: 2000,
    }

    let response
    try {
        response = await sdkTransit.getTripPatterns(getTripPatternsParams, {
            headers: extraHeaders,
        })
    } catch (error) {
        logger.error('Error during searchTransit call to getTripPattern', {
            error,
            params,
        })
        throw error
    }

    const query = getTripPatternsQuery(getTripPatternsParams)
    const queries = [...(prevQueries || []), query]
    const parseTripPattern = createParseTripPattern()

    const tripPatterns = response
        .map(parseTripPattern)
        .filter(isValidTransitAlternative)
        // No, this hack doesn't feel good. But we get wrong data from the backend and
        // customers keep getting stuck on the wrong platform (31st of May 2021)
        .map(replaceQuay1ForOsloSWithUnknown)

    const isSameDaySearch = isSameNorwegianDate(searchDate, initialSearchDate)

    if (!tripPatterns.length && isSameDaySearch) {
        const nextSearchParams = getNextSearchParams(params)
        if (!options?.runOnce) {
            return searchTransit(nextSearchParams, extraHeaders, queries)
        }
        return {
            tripPatterns,
            hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
            queries,
            nextSearchParams,
        }
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
    modes: NonTransitMode[] = [
        LegMode.FOOT,
        LegMode.BICYCLE,
        LegMode.CAR,
        'bicycle_rent',
    ],
): Promise<NonTransitTripPatterns> {
    const parseTripPattern = createParseTripPattern()

    const results = await Promise.all(
        modes.map(async (mode) => {
            try {
                const result = await sdkNonTransit.getTripPatterns(
                    {
                        ...params,
                        limit: mode === 'bicycle_rent' ? 3 : 1,
                        modes:
                            mode === 'bicycle_rent'
                                ? [QueryMode.FOOT, QueryMode.BICYCLE]
                                : [mode as QueryMode],
                        maxPreTransitWalkDistance: 2000,
                        allowBikeRental: mode === 'bicycle_rent',
                    },
                    { headers: extraHeaders },
                )

                const candidate = result.find(({ legs }) => {
                    const modeToCheck =
                        mode === 'bicycle_rent' ? LegMode.BICYCLE : mode

                    const matchesMode = (leg: Leg): boolean =>
                        leg.mode === modeToCheck &&
                        leg.rentedBike === (mode === 'bicycle_rent')

                    const matchesModes =
                        legs.some(matchesMode) &&
                        legs.every(
                            (leg) =>
                                leg.mode === LegMode.FOOT || matchesMode(leg),
                        )

                    return matchesModes
                })

                const tripPattern =
                    candidate &&
                    isValidNonTransitDistance(candidate, mode) &&
                    (mode !== 'bicycle_rent' ||
                        isBikeRentalAlternative(candidate))
                        ? parseTripPattern(candidate)
                        : undefined

                return { mode, tripPattern }
            } catch (error) {
                logger.error(
                    'Error during searchNonTransit call to getTripPattern',
                    {
                        error,
                        params,
                        mode,
                    },
                )
                throw error
            }
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
    extraHeaders: { [key: string]: string },
): Promise<TripPattern[]> {
    const {
        initialSearchDate,
        modes: initialModes = [],
        ...searchParams
    } = params
    const modes: QueryMode[] = [QueryMode.CAR_PICKUP, QueryMode.CAR_DROPOFF]
    const parseTripPattern = createParseTripPattern()

    const [{ car }, [pickup, dropoff]] = await Promise.all([
        searchNonTransit(params, extraHeaders, [LegMode.CAR]),
        Promise.all(
            modes.map(async (mode) => {
                try {
                    const response = await sdkTransit.getTripPatterns(
                        {
                            ...searchParams,
                            limit: 1,
                            maxPreTransitWalkDistance: 2000,
                            modes: [...initialModes, mode],
                        },
                        { headers: extraHeaders },
                    )

                    if (!response?.length) {
                        return []
                    }

                    return response.map(parseTripPattern)
                } catch (error) {
                    logger.error(
                        'Error during searchTaxiFrontBack getTripPattern',
                        {
                            error,
                            params,
                            mode,
                        },
                    )
                    throw error
                }
            }),
        ),
    ])

    return [...pickup, ...dropoff].filter(
        isValidTaxiAlternative(
            initialSearchDate,
            car,
            Boolean(params.arriveBy),
        ),
    )
}

function getNextSearchParams(params: SearchParams): SearchParams {
    const { arriveBy, initialSearchDate, searchDate } = params
    const nextDate = getNextSearchDate(
        Boolean(arriveBy),
        initialSearchDate,
        searchDate,
    )

    return { ...params, searchDate: nextDate }
}

function getNextSearchDate(
    arriveBy: boolean,
    initialDate: Date,
    searchDate: Date,
): Date {
    const hoursSinceInitialSearch = Math.abs(
        differenceInHours(initialDate, searchDate),
    )
    const sign = arriveBy ? -1 : 1
    const searchDateOffset =
        hoursSinceInitialSearch === 0
            ? sign * 2
            : sign * hoursSinceInitialSearch * 3
    const nextSearchDate = addHours(initialDate, searchDateOffset)

    if (isSameNorwegianDate(nextSearchDate, initialDate)) {
        return nextSearchDate
    }

    const norwegianDate = convertToTimeZone(nextSearchDate, {
        timeZone: 'Europe/Oslo',
    })

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
