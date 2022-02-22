import createEnturService, {
    Authority,
    GetTripPatternsParams,
    IntermediateEstimatedCall,
    Leg,
    LegMode,
    Notice,
    TripPattern,
} from '@entur/sdk'
import { Modes, StreetMode } from '@entur/sdk/lib/journeyPlanner/types'

import { v4 as uuid } from 'uuid'
import {
    addDays,
    differenceInDays,
    differenceInMinutes,
    endOfDay,
    parseISO,
    startOfDay,
    subDays,
} from 'date-fns'

import {
    GraphqlQuery,
    Metadata,
    NonTransitTripPatterns,
    RoutingError,
    RoutingErrorCode,
    SearchParams,
} from '../../types'

import { isValidTransitAlternative } from '../../utils/tripPattern'
import { parseLeg } from '../../utils/leg'
import { replaceQuay1ForOsloSWithUnknown } from '../../utils/osloSTrack1Replacer'

import { TRANSIT_HOST_OTP2 } from '../../config'
import { GetTripPatternError, RoutingErrorsError } from '../../errors'

import JOURNEY_PLANNER_QUERY from './query'
import { DEFAULT_MODES, filterModesAndSubModes } from './modes'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: TRANSIT_HOST_OTP2,
    },
})

interface Otp2TripPattern extends TripPattern {
    systemNotices: {
        tag: string
        text: string
    }[]
}

interface AdditionalOtp2TripPatternParams {
    // searchDate is found on TripPatternParams too, but in our case it
    // is never undefined.
    searchDate: Date
    searchWindow?: number
    modes: Modes
    numTripPatterns?: number
}

// GetTripPatternsParams is an OTP1 type, we need to tweak it to match OTP2
type Otp2GetTripPatternParams = Omit<GetTripPatternsParams, 'modes' | 'limit'> &
    AdditionalOtp2TripPatternParams

interface TransitTripPatterns {
    tripPatterns: Otp2TripPattern[]
    queries: GraphqlQuery[]
    metadata?: Metadata
}

// There is no point in continuing the search if any of these routing errors
// are received
const HOPELESS_ROUTING_ERRORS = [
    RoutingErrorCode.noTransitConnection,
    RoutingErrorCode.outsideServicePeriod,
    RoutingErrorCode.outsideBounds,
    RoutingErrorCode.locationNotFound,
    RoutingErrorCode.walkingBetterThanTransit,
    RoutingErrorCode.systemError,
]

function createParseTripPattern(): (rawTripPattern: any) => Otp2TripPattern {
    let i = 0
    const sharedId = uuid()
    const baseId = sharedId.substring(0, 23)
    const iterator = parseInt(sharedId.substring(24), 16)

    return (rawTripPattern: any) => {
        i++
        const id = `${baseId}-${(iterator + i).toString(16).slice(-12)}`
        return parseTripPattern({ id, ...rawTripPattern })
    }
}

function parseTripPattern(rawTripPattern: any): Otp2TripPattern {
    return {
        ...rawTripPattern,
        id: rawTripPattern.id || uuid(),
        legs: rawTripPattern.legs.map(parseLeg),
        genId: `${new Date().getTime()}:${Math.random()
            .toString(36)
            .slice(2, 12)}`,
    }
}

function getTripPatternsVariables(params: Otp2GetTripPatternParams): any {
    const {
        from,
        to,
        searchDate = new Date(),
        arriveBy = false,
        modes = DEFAULT_MODES,
        wheelchairAccessible = false,
        ...rest
    } = params || {}

    return {
        ...rest,
        from,
        to,
        dateTime: searchDate.toISOString(),
        arriveBy,
        modes,
        wheelchairAccessible,
    }
}

function getTripPatternsQuery(
    params: Otp2GetTripPatternParams,
    comment: string,
): GraphqlQuery {
    return {
        query: JOURNEY_PLANNER_QUERY,
        variables: {
            ...getTripPatternsVariables(params),
        },
        comment,
    }
}

function uniqBy<T, K>(arr: T[], getKey: (arg: T) => K): T[] {
    return [
        ...arr
            .reduce((map, item) => {
                const key = getKey(item)

                if (!map.has(key)) {
                    map.set(key, item)
                }

                return map
            }, new Map())
            .values(),
    ]
}

function getNoticesFromIntermediateEstimatedCalls(
    estimatedCalls: IntermediateEstimatedCall[],
): Notice[] {
    if (!estimatedCalls?.length) return []
    return estimatedCalls
        .map(({ notices }) => notices || [])
        .reduce((a, b) => [...a, ...b], [])
}

function getNotices(leg: Leg): Notice[] {
    const notices = [
        ...getNoticesFromIntermediateEstimatedCalls(
            leg.intermediateEstimatedCalls,
        ),
        ...(leg.serviceJourney?.notices || []),
        ...(leg.serviceJourney?.journeyPattern?.notices || []),
        ...(leg.serviceJourney?.journeyPattern?.line?.notices || []),
        ...(leg.fromEstimatedCall?.notices || []),
        ...(leg.toEstimatedCall?.notices || []),
        ...(leg.line?.notices || []),
    ]
    return uniqBy(notices, (notice) => notice.text)
}

function authorityMapper(authority?: Authority): Authority | undefined {
    const codeSpace = authority?.id.split(':')[0]
    if (!authority || !codeSpace) return undefined

    return {
        id: authority.id,
        name: authority.name,
        codeSpace,
        url: authority.url,
    }
}

function legMapper(leg: Leg): Leg {
    return {
        ...leg,
        authority: authorityMapper(leg.authority),
        notices: getNotices(leg),
    }
}

function hasHopelessRoutingError(routingErrors: RoutingError[]): boolean {
    return routingErrors.some(({ code }) =>
        HOPELESS_ROUTING_ERRORS.includes(code),
    )
}

function verifyRoutingErrors(
    routingErrors: RoutingError[],
    params: Otp2GetTripPatternParams,
): void {
    if (hasHopelessRoutingError(routingErrors)) {
        throw new RoutingErrorsError(routingErrors, [
            getTripPatternsQuery(params, 'Routing error'),
        ])
    }
}

async function getAndVerifyTripPatterns(
    params: Otp2GetTripPatternParams,
): Promise<[Otp2TripPattern[], Metadata | undefined, RoutingError[]]> {
    const [tripPatterns, metadata, routingErrors] = await getTripPatterns(
        params,
    )
    verifyRoutingErrors(routingErrors, params)
    return [tripPatterns, metadata, routingErrors]
}

async function getTripPatterns(
    params: Otp2GetTripPatternParams,
    extraHeaders?: Record<string, string>,
): Promise<[Otp2TripPattern[], Metadata | undefined, RoutingError[]]> {
    let res
    try {
        res = await sdk.queryJourneyPlanner<{
            trip: {
                // metadata will be undefined if routingErrors is not empty
                metadata: Metadata | undefined
                tripPatterns: any[]
                routingErrors: RoutingError[]
            }
        }>(JOURNEY_PLANNER_QUERY, getTripPatternsVariables(params), {
            headers: extraHeaders,
        })
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
        metadata,
        routingErrors,
    ]
}

function getMinutesBetweenDates(
    a: Date,
    b: Date,
    limits?: { min: number; max?: number },
): number {
    const min = limits?.min || 0
    const max = limits?.max || Infinity
    const diff = Math.abs(differenceInMinutes(a, b))
    return Math.max(min, Math.min(max, diff))
}

function sortTripPatternsByExpectedTime(
    tripPatterns: Otp2TripPattern[],
    arriveBy: boolean,
): Otp2TripPattern[] {
    // eslint-disable-next-line fp/no-mutating-methods
    return tripPatterns.sort((a, b) => {
        if (arriveBy) return a.expectedEndTime > b.expectedEndTime ? -1 : 1
        return a.expectedStartTime < b.expectedStartTime ? -1 : 1
    })
}

function getNextSearchDateFromMetadata(
    metadata: Metadata,
    arriveBy = false,
): Date {
    const dateTime = arriveBy ? metadata.prevDateTime : metadata.nextDateTime
    return parseISO(dateTime)
}

function combineAndSortFlexibleAndTransitTripPatterns(
    regularTripPatterns: Otp2TripPattern[],
    flexibleTripPattern?: Otp2TripPattern,
    nextDateTime?: Date,
    arriveBy = false,
): Otp2TripPattern[] {
    if (!flexibleTripPattern) return regularTripPatterns

    const sortedTripPatterns = sortTripPatternsByExpectedTime(
        [flexibleTripPattern, ...regularTripPatterns],
        arriveBy,
    )

    if (!nextDateTime) {
        return sortedTripPatterns
    }

    const flexIsOutsideTransitSearchWindowUsed = arriveBy
        ? parseISO(flexibleTripPattern.expectedEndTime) < nextDateTime
        : parseISO(flexibleTripPattern.expectedStartTime) > nextDateTime

    if (flexIsOutsideTransitSearchWindowUsed) {
        return regularTripPatterns
    }

    return sortedTripPatterns
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
    flexibleTripPattern: Otp2TripPattern,
    searchParams: any,
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
        await getAndVerifyTripPatterns(nextSearchParams)

    const tripPatterns = transitResultsBeforeFlexible
        .filter(isValidTransitAlternative)
        .map(replaceQuay1ForOsloSWithUnknown)

    const queries = [
        getTripPatternsQuery(nextSearchParams, 'Search before flexible'),
    ]
    return {
        queries,
        metadata,
        tripPatterns,
    }
}

function getNextSearchParams(
    searchParams: Otp2GetTripPatternParams,
    metaData: Metadata | undefined,
): Otp2GetTripPatternParams {
    const { searchDate, arriveBy } = searchParams

    // Metadata will be null if routingErrors is not empty, because searchWindow
    // cannot be calculated.
    if (metaData) {
        const dateTime = arriveBy
            ? metaData.prevDateTime
            : metaData.nextDateTime

        return {
            ...searchParams,
            searchWindow: metaData.searchWindowUsed,
            searchDate: parseISO(dateTime),
        }
    } else {
        const nextMidnight = arriveBy
            ? endOfDay(subDays(searchDate, 1))
            : startOfDay(addDays(searchDate, 1))

        return {
            ...searchParams,
            searchDate: nextMidnight,
        }
    }
}

async function searchTransitUntilMaxRetries(
    initialSearchDate: Date,
    previousSearchParams: Otp2GetTripPatternParams,
    previousMetadata: Metadata | undefined,
    prevQueries: GraphqlQuery[],
    extraHeaders: { [p: string]: string },
): Promise<TransitTripPatterns> {
    const nextSearchParams = getNextSearchParams(
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
    )

    const tripPatterns = response
        .filter(isValidTransitAlternative)
        .map(replaceQuay1ForOsloSWithUnknown)

    if (tripPatterns.length) {
        return {
            tripPatterns,
            metadata,
            queries,
        }
    }

    const daysSearched = Math.abs(
        differenceInDays(nextSearchParams.searchDate, initialSearchDate),
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
async function searchFlexible(searchParams: Otp2GetTripPatternParams): Promise<{
    tripPatterns: Otp2TripPattern[]
    queries: GraphqlQuery[]
}> {
    const getTripPatternsParams: Otp2GetTripPatternParams = {
        ...searchParams,
        modes: {
            transportModes: [],
            directMode: StreetMode.Flexible,
        },
        numTripPatterns: 1,
    }

    const queries = [
        getTripPatternsQuery(getTripPatternsParams, 'Search flexible'),
    ]

    const [returnedTripPatterns] = await getTripPatterns(getTripPatternsParams)

    const tripPatterns = returnedTripPatterns.filter(({ legs }) => {
        const isFootOnly = legs.length === 1 && legs[0]?.mode === LegMode.FOOT
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
    searchParams: Otp2GetTripPatternParams,
    options: { access: boolean; egress: boolean },
): Promise<TransitTripPatterns> {
    const { access, egress } = options

    const getTripPatternsParams = {
        ...searchParams,
        modes: {
            ...DEFAULT_MODES,
            accessMode: access ? StreetMode.CarPickup : StreetMode.Foot,
            egressMode: egress ? StreetMode.CarPickup : StreetMode.Foot,
        },
        numTripPatterns: egress && access ? 2 : 1,
    }

    const [tripPatterns] = await getAndVerifyTripPatterns(getTripPatternsParams)
    const queries = [
        getTripPatternsQuery(getTripPatternsParams, 'Search taxi front back'),
    ]

    // If no access or egress leg is necessary, we can get trip patterns with
    // no car legs. We therefore filter the results to prevent it from
    // returning results that the normal search also might return.
    const taxiResults = tripPatterns.filter(({ legs }) =>
        legs.some(({ mode }) => mode === LegMode.CAR),
    )

    return {
        tripPatterns: taxiResults,
        queries,
    }
}

/**
 * TODO 7/12-21: Clean up function signature and types once OTP1 is gone.
 * As we have removed recursion, initialSearchDate can be replaced with
 * searchDate. searchFilter could
 * be kept separate from Otp2SearchParams.
 */
export async function searchTransit(
    { initialSearchDate, searchFilter, ...searchParams }: SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<TransitTripPatterns> {
    const { searchDate, arriveBy } = searchParams

    const getTripPatternsParams = {
        ...searchParams,
        modes: filterModesAndSubModes(
            searchFilter,
            extraHeaders['ET-Client-Version'],
            extraHeaders['ET-Client-Platform'],
        ),
    }

    // initial search date may differ from search date if this is a
    // continuation search using a cursor.
    const isFirstSearchIteration =
        differenceInMinutes(initialSearchDate, searchDate) < 1

    // We do two searches in parallel here to speed things up a bit. One is a
    // flexible search where we explicitly look for trips that may include means
    // of transport that has to be booked in advance the second is a regular
    // search.
    const [
        flexibleResults,
        [regularTripPatternsUnfiltered, initialMetadata, routingErrors],
    ] = await Promise.all([
        isFirstSearchIteration ? searchFlexible(searchParams) : undefined,
        getTripPatterns(getTripPatternsParams),
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

    let regularTripPatterns = regularTripPatternsUnfiltered
        .filter(isValidTransitAlternative)
        .map(replaceQuay1ForOsloSWithUnknown)

    const nextSearchDateFromMetadata =
        metadata && getNextSearchDateFromMetadata(metadata, arriveBy)

    // If we have any noStopsInRange errors, we couldn't find a means of
    // transport from where the traveler wants to start or end the trip. Try to
    // find an option using taxi for those parts instead.
    const noStopsInRangeErrors = routingErrors.filter(
        ({ code }) => code === RoutingErrorCode.noStopsInRange,
    )
    const hasStopsInRange = noStopsInRangeErrors.length === 0
    let taxiTripPatterns: Otp2TripPattern[] = []
    if (!hasStopsInRange) {
        const noFromStopInRange = noStopsInRangeErrors.some(
            (e) => e.inputField === 'from',
        )
        const noToStopInRange = noStopsInRangeErrors.some(
            (e) => e.inputField === 'to',
        )

        const taxiResults = await searchTaxiFrontBack(searchParams, {
            access: noFromStopInRange,
            egress: noToStopInRange,
        })
        taxiTripPatterns = taxiResults.tripPatterns
        queries = [...queries, ...taxiResults.queries]
    }

    // Flexible may return results in the future that are outside the
    // original search window. There may still exist normal transport in the
    // time between the search window end and the first suggested flexible
    // result. For example, if  the search window ends on midnight Friday, and
    // the first suggested flexible result is on Monday morning, we can probably
    // still find a normal transport option on Saturday.

    // To find these so we do a new search if we found no regular trip patterns
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
        )
        regularTripPatterns = beforeFlexibleResult.tripPatterns
        metadata = beforeFlexibleResult.metadata
        queries = [...queries, ...beforeFlexibleResult.queries]
    }

    const tripPatterns = [
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
        initialSearchDate,
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
            const getTripPatternsParams: Otp2GetTripPatternParams = {
                ...params,
                numTripPatterns: 1,
                modes: {
                    directMode: mode,
                    transportModes: [],
                },
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
                const modeToCheck =
                    mode === StreetMode.BikeRental ? LegMode.BICYCLE : mode

                const matchesMode = (leg: Leg): boolean =>
                    leg.mode === modeToCheck

                return (
                    legs.some(matchesMode) &&
                    legs.every(
                        (leg) => leg.mode === LegMode.FOOT || matchesMode(leg),
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
