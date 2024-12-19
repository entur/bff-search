import { graphqlRequest } from '../../utils/graphqlRequest'
import { isTransitAlternative } from '../../utils/tripPattern'
import { TRANSIT_HOST_OTP2 } from '../../config'
import { GetTripPatternError, RoutingErrorsError } from '../../errors'
import {
    GraphqlQuery,
    NonTransitTripPatterns,
    RoutingError,
    RoutingErrorCode,
    SearchParams,
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

import {
    cleanQueryVariables,
    createParseTripPattern,
    getQueryVariables,
    getTripPatternsQuery,
    legMapper,
} from './helpers'

import { hasHopelessRoutingError, verifyRoutingErrors } from './routingErrors'

interface TransitTripPatterns {
    tripPatterns: TripPatternParsed[]
    queries: GraphqlQuery[]
    previousPageCursor?: string | null
    nextPageCursor?: string | null
    routingErrors?: RoutingError[]
}

interface FlexibleTransitTripPatterns {
    tripPatterns: TripPatternParsed[]
    queries: GraphqlQuery[]
}

export async function searchTransit(
    searchParams: SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<TransitTripPatterns> {
    const getTripPatternsParams = getQueryVariables(searchParams)

    // We do two searches in parallel here to speed things up a bit. One is a
    // flexible search where we explicitly look for trips that may include means
    // of transport that has to be booked in advance the second is a regular
    // search.

    const comment = 'First regular search'
    const [
        [
            regularTripPatternsUnfiltered,
            routingErrors,
            previousPageCursor,
            nextPageCursor,
        ],
    ] = await Promise.all([
        getTripPatterns(getTripPatternsParams, extraHeaders, comment),
    ])

    const queries = [getTripPatternsQuery(getTripPatternsParams, comment)]

    // If the normal search failed with a hopeless error, indicating we shouldn't
    // continue with normal searches, we may still have a flexible result.
    // If so, return that instead of aborting by throwing an exception

    if (hasHopelessRoutingError(routingErrors)) {
        throw new RoutingErrorsError(routingErrors, queries)
    }

    const regularTripPatterns =
        regularTripPatternsUnfiltered.filter(isTransitAlternative)

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

    // Searching for normal transport options again will not suddenly make new
    // stops magically appear, so we abort further searching.
    if (!hasStopsInRange && regularTripPatterns.length < 1) {
        return {
            tripPatterns: [],
            queries,
        }
    }

    return {
        tripPatterns: regularTripPatterns,
        queries,
        previousPageCursor,
        nextPageCursor,
        routingErrors,
    }
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
                numTripPatterns: 2,
            }

            const comment = 'Search non transit'

            const [result] = await getTripPatterns(
                getTripPatternsParams,
                extraHeaders,
                comment,
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

            const query = getTripPatternsQuery(getTripPatternsParams, comment)

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

export async function searchFlexibleTransit(
    searchParams: SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<FlexibleTransitTripPatterns> {
    const getTripPatternsParams = getQueryVariables(searchParams)

    const [flexibleResults] = await Promise.all([
        searchFlexible(getTripPatternsParams, extraHeaders),
    ])

    let queries = [...(flexibleResults?.queries || [])]
    let taxiTripPatterns: TripPatternParsed[] = []

    const variables = getQueryVariables(searchParams)
    const [taxiFront, taxiBack] = await Promise.all([
        searchTaxiFrontBack(
            variables,
            { access: true, egress: false },
            extraHeaders,
        ),
        searchTaxiFrontBack(
            variables,
            { access: false, egress: true },
            extraHeaders,
        ),
    ])

    const taxiResults: TransitTripPatterns = taxiFront.tripPatterns.length
        ? taxiFront
        : taxiBack

    taxiTripPatterns = taxiResults.tripPatterns
    queries = [...queries, ...taxiResults.queries]

    return {
        tripPatterns: [...flexibleResults.tripPatterns, ...taxiTripPatterns],
        queries,
    }
}

async function getAndVerifyTripPatterns(
    params: GetTripPatternsQueryVariables,
    extraHeaders: Record<string, string>,
    comment: string,
): Promise<
    [TripPatternParsed[], RoutingError[], string | null, string | null]
> {
    const [tripPatterns, routingErrors, nextPageCursor, previousPageCursor] =
        await getTripPatterns(params, extraHeaders, comment)
    verifyRoutingErrors(routingErrors, params)
    return [tripPatterns, routingErrors, nextPageCursor, previousPageCursor]
}

async function getTripPatterns(
    params: GetTripPatternsQueryVariables,
    extraHeaders: Record<string, string>,
    comment: string,
): Promise<
    [TripPatternParsed[], RoutingError[], string | null, string | null]
> {
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
            comment,
        )
    } catch (error) {
        throw new GetTripPatternError(
            error,
            getTripPatternsQuery(params, 'Backend error'),
        )
    }

    const { routingErrors, nextPageCursor, previousPageCursor } = res.trip
    const parse = createParseTripPattern()
    return [
        (res.trip.tripPatterns || [])
            .map((pattern: any) => ({
                ...pattern,
                legs: pattern.legs.map(legMapper),
            }))
            .map(parse),
        routingErrors.map((routingError) => ({
            ...routingError,
            inputField: routingError.inputField || null,
        })) || [],
        previousPageCursor,
        nextPageCursor,
    ]
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

    const comment = 'Search flexible'

    const queries = [getTripPatternsQuery(getTripPatternsParams, comment)]

    const [returnedTripPatterns] = await getTripPatterns(
        getTripPatternsParams,
        extraHeaders,
        comment,
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
            transportModes: searchParams.modes.transportModes,
            directMode: null,
            accessMode: access ? StreetMode.CarPickup : StreetMode.Foot,
            egressMode: egress ? StreetMode.CarPickup : StreetMode.Foot,
        },
        numTripPatterns: egress && access ? 2 : 1,
    }
    const comment = 'Search taxi front back'

    const [tripPatterns] = await getAndVerifyTripPatterns(
        getTripPatternsParams,
        extraHeaders,
        comment,
    )
    const queries = [getTripPatternsQuery(getTripPatternsParams, comment)]

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
