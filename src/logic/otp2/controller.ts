import { request as graphqlRequest } from 'graphql-request'
import { differenceInDays, parseISO } from 'date-fns'

import { isValidTransitAlternative } from '../../utils/tripPattern'
import { TRANSIT_HOST_OTP2 } from '../../config'
import { GetTripPatternError, RoutingErrorsError } from '../../errors'
import {
    GraphqlQuery,
    Metadata,
    NonTransitTripPatterns,
    RoutingError,
    RoutingErrorCode,
    SearchParams,
    TripPattern,
    Leg,
    TripPatternParsed,
} from '../../types'
import {
    GetTripPatternsQuery,
    GetTripPatternsQueryVariables,
    Mode,
    StreetMode,
} from '../../generated/graphql'

import JOURNEY_PLANNER_QUERY from './queries/getTripPatterns.query'
import { DEFAULT_MODES } from './modes'
import {
    cleanQueryVariables,
    combineAndSortFlexibleAndTransitTripPatterns,
    createParseTripPattern,
    getMinutesBetweenDates,
    getNextQueryVariables,
    getNextSearchDateFromMetadata,
    getQueryVariables,
    getTripPatternsQuery,
    legMapper,
} from './helpers'

import { hasHopelessRoutingError, verifyRoutingErrors } from './routingErrors'

interface TransitTripPatterns {
    tripPatterns: TripPatternParsed[]
    queries: GraphqlQuery[]
    metadata?: Metadata
}

export async function searchTransit(
    searchParams: SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<TransitTripPatterns> {
    const { searchDate, arriveBy } = searchParams
    const getTripPatternsParams = getQueryVariables(searchParams)

    // We do two searches in parallel here to speed things up a bit. One is a
    // flexible search where we explicitly look for trips that may include means
    // of transport that has to be booked in advance the second is a regular
    // search.
    const [
        flexibleResults,
        [regularTripPatternsUnfiltered, initialMetadata, routingErrors],
    ] = await Promise.all([
        searchFlexible(getTripPatternsParams, extraHeaders),
        getTripPatterns(getTripPatternsParams, extraHeaders),
    ])

    let queries = [
        ...(flexibleResults?.queries || []),
        getTripPatternsQuery(getTripPatternsParams, 'First regular search'),
    ]

    // If the normal search failed with a hopeless error, indicating we shouldn't
    // continue with normal searches, we may still have a flexible result.
    // If so, return that instead of aborting by throwing an exception

    if (hasHopelessRoutingError(routingErrors)) {
        if (flexibleResults?.tripPatterns?.length) {
            return {
                tripPatterns: flexibleResults.tripPatterns,
                metadata: undefined,
                queries,
            }
        } else {
            throw new RoutingErrorsError(routingErrors, queries)
        }
    }

    let metadata = initialMetadata
    let nextSearchDateFromMetadata =
        metadata && getNextSearchDateFromMetadata(metadata, arriveBy)

    let regularTripPatterns = regularTripPatternsUnfiltered.filter(
        isValidTransitAlternative,
    )

    // If we have any noStopsInRange or noTransitConnection errors, we couldn't find a means of
    // transport from where the traveler wants to start or end the trip. Try to
    // find an option using taxi for those parts instead.
    const noStopsInRangeErrorsOrNoTransitConnectionErrors =
        routingErrors.filter(
            ({ code }) =>
                code === RoutingErrorCode.NoStopsInRange ||
                code === RoutingErrorCode.NoTransitConnection,
        )

    const hasStopsInRange =
        noStopsInRangeErrorsOrNoTransitConnectionErrors.length === 0

    let taxiTripPatterns: TripPatternParsed[] = []
    if (!hasStopsInRange) {
        const taxiResults = await searchTaxiFrontBack(
            getQueryVariables(searchParams),
            {
                access: true,
                egress: true,
            },
            extraHeaders,
        )
        taxiTripPatterns = taxiResults.tripPatterns
        queries = [...queries, ...taxiResults.queries]
    }

    // Flexible may return results in the future that are outside the
    // original search window. There may still exist normal transport in the
    // time between the search window end and the first suggested flexible
    // result. For example, if  the search window ends on midnight Friday, and
    // the first suggested flexible result is on Monday morning, we can probably
    // still find a normal transport option on Saturday.

    // To find these we do a new search if we found no regular trip patterns
    // within the original search window.
    const flexibleTripPattern = flexibleResults?.tripPatterns[0]
    const hasFlexibleResultsOnly =
        flexibleTripPattern && !regularTripPatterns.length
    if (hasFlexibleResultsOnly && hasStopsInRange) {
        const beforeFlexibleResult = await searchBeforeFlexible(
            nextSearchDateFromMetadata || searchDate,
            arriveBy,
            flexibleTripPattern,
            getTripPatternsParams,
            extraHeaders,
        )
        regularTripPatterns = beforeFlexibleResult.tripPatterns
        metadata = beforeFlexibleResult.metadata
        nextSearchDateFromMetadata =
            metadata && getNextSearchDateFromMetadata(metadata, arriveBy)

        queries = [...queries, ...beforeFlexibleResult.queries]
    }

    const tripPatterns: TripPatternParsed[] = [
        ...taxiTripPatterns,
        ...combineAndSortFlexibleAndTransitTripPatterns(
            regularTripPatterns,
            flexibleTripPattern,
            nextSearchDateFromMetadata,
            arriveBy,
        ),
    ]

    if (tripPatterns.length) {
        return {
            tripPatterns,
            metadata,
            queries,
        }
    }

    // Searching for normal transport options again will not suddenly make new
    // stops magically appear, so we abort further searching.
    if (!hasStopsInRange) {
        return {
            tripPatterns: [],
            metadata: undefined,
            queries,
        }
    }

    // Try again without taxi and flex searches until we either find something
    // or reach the maximum retries/maximum days back/forwards
    return searchTransitUntilMaxRetries(
        searchDate,
        getTripPatternsParams,
        metadata,
        queries,
        extraHeaders,
    )
}

type NonTransitMode =
    | StreetMode.Foot
    | StreetMode.Bicycle
    | StreetMode.Car
    | StreetMode.BikeRental

export async function searchNonTransit(
    params: Pick<SearchParams, 'from' | 'to' | 'searchDate'>,
    extraHeaders: Record<string, string>,
    modes: NonTransitMode[] = [
        StreetMode.Foot,
        StreetMode.Bicycle,
        StreetMode.Car,
        StreetMode.BikeRental,
    ],
): Promise<{
    tripPatterns: NonTransitTripPatterns
    queries: { [key in NonTransitMode]?: GraphqlQuery }
}> {
    const results = await Promise.all(
        modes.map(async (mode) => {
            const searchParams = getQueryVariables({
                ...params,
                modes: {
                    directMode: mode,
                    transportModes: [],
                    accessMode: null,
                    egressMode: null,
                },
            })

            const getTripPatternsParams = {
                ...searchParams,
                numTripPatterns: 1,
            }

            const [result] = await getTripPatterns(
                getTripPatternsParams,
                extraHeaders,
            )

            /**
             * Although we specify a specific mode in the query params, we
             * might still get foot-only trip patterns, since OTP will fall
             * back to this if there are no possible results for the given
             * mode. Especially relevant for bike_rental.
             */
            const candidate = result.find(({ legs }) => {
                const modeToCheck = ((): Mode => {
                    switch (mode) {
                        case StreetMode.Foot:
                            return Mode.Foot
                        case StreetMode.Bicycle:
                            return Mode.Bicycle
                        case StreetMode.Car:
                            return Mode.Car
                        case StreetMode.BikeRental:
                            return Mode.Bicycle
                    }
                })()

                const matchesMode = (leg: Leg): boolean =>
                    leg.mode === modeToCheck

                return (
                    legs.some(matchesMode) &&
                    legs.every(
                        (leg) => leg.mode === Mode.Foot || matchesMode(leg),
                    )
                )
            })

            const query = getTripPatternsQuery(
                getTripPatternsParams,
                'Search non transit',
            )

            return { mode, tripPattern: candidate, query }
        }),
    )

    return results.reduce(
        (acc, { mode, tripPattern, query }) => {
            const m = mode === StreetMode.BikeRental ? 'bicycle_rent' : mode
            return {
                tripPatterns: {
                    ...acc.tripPatterns,
                    [m]: tripPattern,
                },
                queries: {
                    ...acc.queries,
                    [m]: query,
                },
            }
        },
        {
            tripPatterns: {},
            queries: {},
        },
    )
}

async function getAndVerifyTripPatterns(
    params: GetTripPatternsQueryVariables,
    extraHeaders: Record<string, string>,
): Promise<[TripPatternParsed[], Metadata | undefined, RoutingError[]]> {
    const [tripPatterns, metadata, routingErrors] = await getTripPatterns(
        params,
        extraHeaders,
    )
    verifyRoutingErrors(routingErrors, params)
    return [tripPatterns, metadata, routingErrors]
}

async function getTripPatterns(
    params: GetTripPatternsQueryVariables,
    extraHeaders: Record<string, string>,
): Promise<[TripPatternParsed[], Metadata | undefined, RoutingError[]]> {
    let res: GetTripPatternsQuery
    try {
        res = await graphqlRequest<
            GetTripPatternsQuery,
            GetTripPatternsQueryVariables
        >(
            `${TRANSIT_HOST_OTP2}/graphql`,
            JOURNEY_PLANNER_QUERY,
            cleanQueryVariables(params),
            extraHeaders,
        )
    } catch (error) {
        throw new GetTripPatternError(
            error,
            getTripPatternsQuery(params, 'Backend error'),
        )
    }

    const { metadata, routingErrors } = res.trip
    const parse = createParseTripPattern()
    return [
        (res.trip.tripPatterns || [])
            .map((pattern: any) => ({
                ...pattern,
                legs: pattern.legs.map(legMapper),
            }))
            .map(parse),
        (metadata as Metadata) || undefined,
        routingErrors.map((routingError) => ({
            ...routingError,
            inputField: routingError.inputField || null,
        })) || [],
    ]
}

/**
 * Search for results in the time between the end of a search window and the
 * first available flexible trip. This is necessary as we may get a flexible
 * trip suggestion a few days in the future. Normal transport that would be a
 * better suggestion to the traveler may be available in that time period.
 */
async function searchBeforeFlexible(
    searchDate: Date,
    arriveBy = false,
    flexibleTripPattern: TripPattern,
    searchParams: any,
    extraHeaders: Record<string, string>,
): Promise<TransitTripPatterns> {
    const searchWindow = getMinutesBetweenDates(
        parseISO(
            arriveBy
                ? flexibleTripPattern.expectedEndTime
                : flexibleTripPattern.expectedStartTime,
        ),
        searchDate,
        { min: 60 },
    )

    const nextSearchParams = {
        ...searchParams,
        searchDate,
        searchWindow,
    }

    const [transitResultsBeforeFlexible, metadata] =
        await getAndVerifyTripPatterns(nextSearchParams, extraHeaders)

    const tripPatterns: TripPatternParsed[] =
        transitResultsBeforeFlexible.filter(isValidTransitAlternative)

    const queries = [
        getTripPatternsQuery(nextSearchParams, 'Search before flexible'),
    ]
    return {
        queries,
        metadata,
        tripPatterns,
    }
}

async function searchTransitUntilMaxRetries(
    initialSearchDate: Date,
    previousSearchParams: GetTripPatternsQueryVariables,
    previousMetadata: Metadata | undefined,
    prevQueries: GraphqlQuery[],
    extraHeaders: Record<string, string>,
): Promise<TransitTripPatterns> {
    const nextSearchParams = getNextQueryVariables(
        previousSearchParams,
        previousMetadata,
    )

    const queries = [
        ...prevQueries,
        getTripPatternsQuery(
            nextSearchParams,
            `Search again (${prevQueries.length + 1}) ${
                previousMetadata ? 'with' : 'without'
            } metadata`,
        ),
    ]

    const [response, metadata] = await getAndVerifyTripPatterns(
        nextSearchParams,
        extraHeaders,
    )

    const tripPatterns = response.filter(isValidTransitAlternative)

    if (tripPatterns.length) {
        return {
            tripPatterns,
            metadata,
            queries,
        }
    }

    const daysSearched = Math.abs(
        differenceInDays(
            parseISO(nextSearchParams.dateTime),
            initialSearchDate,
        ),
    )

    // When we have metadata, we limit by the number of queries as each result
    // may only be for parts of a day. Queries where metadata is missing is
    // limited by a set number of days, and each query spans a full day, as we
    // have no information about the next search window to use.
    const shouldSearchAgain =
        (metadata && queries.length <= 15) || (!metadata && daysSearched < 7)
    if (shouldSearchAgain) {
        return searchTransitUntilMaxRetries(
            initialSearchDate,
            nextSearchParams,
            metadata,
            queries,
            extraHeaders,
        )
    }

    // Returning metadata undefined will stop generation of a new cursor
    return {
        tripPatterns: [],
        metadata: undefined,
        queries,
    }
}

/**
 * A flexible search includes modes of transport (bus or other) where the
 * traveler has to book a call in advance - if not, the bus may either drive
 * past or not show up at all.
 *
 * Such services do not run at all hours of the day, but we will still return
 * the first available match, even if it is outside the requested search window.
 *
 * For example, if you do a search on a Friday evening at 8pm, but the service
 * is not available after 6pm, you may get a suggestion Monday morning at 8am
 * when the service starts again.
 *
 * This is kind of a catch, as there may be other, better suggestions using
 * normal transport in the time between your search window and the flexible
 * suggestion - for example, if your normal search window ends Friday at
 * midnight, there still may be transport available all of Saturday. This must
 * be handled separately.
 */
async function searchFlexible(
    searchParams: GetTripPatternsQueryVariables,
    extraHeaders: Record<string, string>,
): Promise<{
    tripPatterns: TripPatternParsed[]
    queries: GraphqlQuery[]
}> {
    const getTripPatternsParams = {
        ...searchParams,
        modes: {
            accessMode: null,
            egressMode: null,
            transportModes: [],
            directMode: StreetMode.Flexible,
        },
        numTripPatterns: 1,
    }

    const queries = [
        getTripPatternsQuery(getTripPatternsParams, 'Search flexible'),
    ]

    const [returnedTripPatterns] = await getTripPatterns(
        getTripPatternsParams,
        extraHeaders,
    )

    const tripPatterns = returnedTripPatterns.filter(({ legs }) => {
        const isFootOnly = legs.length === 1 && legs[0]?.mode === Mode.Foot
        return !isFootOnly
    })

    return {
        tripPatterns,
        queries,
    }
}

/**
 * Have you ever wondered what access or egress means? Well, you're lucky -
 * here's the definition for you:
 *  - access - the means or opportunity to approach or enter a place
 *  - egress - the action of going out of or leaving a place.
 *
 * So if access is true, try to find a taxi at the start of the trip, if
 * egress is true, do the same at the end of the trip. Domain specific language
 * is fun!
 */
async function searchTaxiFrontBack(
    searchParams: GetTripPatternsQueryVariables,
    options: { access: boolean; egress: boolean },
    extraHeaders: Record<string, string>,
): Promise<TransitTripPatterns> {
    const { access, egress } = options

    const getTripPatternsParams: GetTripPatternsQueryVariables = {
        ...searchParams,
        modes: {
            ...DEFAULT_MODES,
            accessMode: access ? StreetMode.CarPickup : StreetMode.Foot,
            egressMode: egress ? StreetMode.CarPickup : StreetMode.Foot,
        },
        numTripPatterns: egress && access ? 2 : 1,
    }

    const [tripPatterns] = await getAndVerifyTripPatterns(
        getTripPatternsParams,
        extraHeaders,
    )
    const queries = [
        getTripPatternsQuery(getTripPatternsParams, 'Search taxi front back'),
    ]

    // If no access or egress leg is necessary, we can get trip patterns with
    // no car legs. We therefore filter the results to prevent it from
    // returning results that the normal search also might return.
    const taxiResults = tripPatterns.filter(({ legs }) =>
        legs.some(({ mode }) => mode === Mode.Car),
    )

    return {
        tripPatterns: taxiResults,
        queries,
    }
}
