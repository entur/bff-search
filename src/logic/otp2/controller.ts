import createEnturService, {
    Authority,
    GetTripPatternsParams,
    IntermediateEstimatedCall,
    Leg,
    LegMode,
    Notice,
    TripPattern,
} from '@entur/sdk'
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
import {
    DEFAULT_MODES,
    filterModesAndSubModes,
    Modes,
    StreetMode,
} from './modes'

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
    searchWindow?: number
    modes: Modes
}

// function signature type, to match signature for OTP1 searchTransit.
type Otp2SearchParams = Omit<SearchParams, 'modes'> &
    AdditionalOtp2TripPatternParams

// GetTripPatternsParams is an OTP1 type, we need to tweak it to match OTP2
type Otp2GetTripPatternParams = Omit<GetTripPatternsParams, 'modes'> &
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

export function createParseTripPattern(): (
    rawTripPattern: any,
) => Otp2TripPattern {
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

function getTripPatternsQuery(params: Otp2GetTripPatternParams): GraphqlQuery {
    return {
        query: JOURNEY_PLANNER_QUERY,
        variables: getTripPatternsVariables(params),
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
    if (!authority) return undefined

    return {
        id: authority.id,
        name: authority.name,
        codeSpace: authority.id.split(':')[0] || '',
        url: authority.url,
    }
}

export function legMapper(leg: Leg): Leg {
    return {
        ...leg,
        authority: authorityMapper(leg.authority),
        notices: getNotices(leg),
    }
}

async function getTripPatterns(
    params: any,
): Promise<[Otp2TripPattern[], Metadata | undefined, RoutingError[]]> {
    const query = getTripPatternsQuery(params)
    let res
    try {
        res = await sdk.queryJourneyPlanner<{
            trip: {
                // metadata will be undefined if routingErrors is not empty
                metadata: Metadata | undefined
                tripPatterns: any[]
                routingErrors: RoutingError[]
            }
        }>(JOURNEY_PLANNER_QUERY, getTripPatternsVariables(params))
    } catch (error) {
        throw new GetTripPatternError(error, query)
    }

    const { metadata, routingErrors } = res.trip

    if (
        routingErrors.some(({ code }) => HOPELESS_ROUTING_ERRORS.includes(code))
    ) {
        throw new RoutingErrorsError(routingErrors, [query])
    }

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

    const [transitResultsBeforeFlexible, metadata] = await getTripPatterns(
        nextSearchParams,
    )

    const tripPatterns = transitResultsBeforeFlexible
        .filter(isValidTransitAlternative)
        .map(replaceQuay1ForOsloSWithUnknown)

    const queries = [getTripPatternsQuery(nextSearchParams)]
    return {
        queries,
        metadata,
        tripPatterns,
    }
}

export async function searchTransitUntilMaxRetries(
    initialSearchDate: Date,
    searchParams: Otp2GetTripPatternParams,
    extraHeaders: { [key: string]: string },
    prevQueries: GraphqlQuery[],
): Promise<TransitTripPatterns> {
    const { searchDate, arriveBy } = searchParams

    const queries = [...prevQueries, getTripPatternsQuery(searchParams)]
    const [response, metadata] = await getTripPatterns(searchParams)

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

    // Metadata will be null if routingErrors is not empty, because searchWindow
    // cannot be calculated.
    //
    // When we have metadata, we limit by the number of queries as each result
    // may only be for parts of a day. Queries where metadata is missing is
    // limited by a set number of days, and each query spans a full day, as we
    // have no information about the next search window to use.
    if (metadata) {
        if (queries.length > 15) {
            // We have tried as many times as we should but could not find
            // any trip patterns. Give up.
            return {
                tripPatterns: [],
                metadata: undefined, // Returning metadata undefined will stop generation of a new cursor
                queries,
            }
        }

        const dateTime = arriveBy
            ? metadata.prevDateTime
            : metadata.nextDateTime

        const nextSearchParams = {
            ...searchParams,
            searchWindow: metadata.searchWindowUsed,
            searchDate: parseISO(dateTime),
        }

        return searchTransitUntilMaxRetries(
            initialSearchDate,
            nextSearchParams,
            extraHeaders,
            queries,
        )
    } else {
        const nextMidnight = arriveBy
            ? endOfDay(subDays(searchDate || new Date(), 1))
            : startOfDay(addDays(searchDate || new Date(), 1))

        if (Math.abs(differenceInDays(nextMidnight, initialSearchDate)) >= 7) {
            // We have tried as far back as we should but could not find
            // any trip patterns. Give up.
            return {
                tripPatterns: [],
                metadata: undefined, // Returning metadata undefined will stop generation of a new cursor
                queries,
            }
        }

        const nextSearchParams = {
            ...searchParams,
            searchDate: nextMidnight,
        }

        return searchTransitUntilMaxRetries(
            initialSearchDate,
            nextSearchParams,
            extraHeaders,
            queries,
        )
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
    const getTripPatternsParams = {
        ...searchParams,
        modes: {
            transportModes: [],
            directMode: StreetMode.FLEXIBLE,
        },
        numTripPatterns: 1,
    }

    const queries = [getTripPatternsQuery(getTripPatternsParams)]
    try {
        const [returnedTripPatterns] = await getTripPatterns(
            getTripPatternsParams,
        )

        const tripPatterns = returnedTripPatterns.filter(({ legs }) => {
            const isFootOnly =
                legs.length === 1 && legs[0]?.mode === LegMode.FOOT
            return !isFootOnly
        })

        return {
            tripPatterns,
            queries,
        }
    } catch (error) {
        // If we let a flexible search throw this error it will
        // block the 'normal' search from completing and
        // finding valid suggestions.
        if (error instanceof RoutingErrorsError) {
            return {
                tripPatterns: [],
                queries,
            }
        }
        throw error
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
            accessMode: access ? StreetMode.CAR_PICKUP : StreetMode.FOOT,
            egressMode: egress ? StreetMode.CAR_PICKUP : StreetMode.FOOT,
        },
        numTripPatterns: egress && access ? 2 : 1,
    }

    const [tripPatterns] = await getTripPatterns(getTripPatternsParams)
    const queries = [getTripPatternsQuery(getTripPatternsParams)]

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
    { initialSearchDate, searchFilter, ...searchParams }: Otp2SearchParams,
    extraHeaders: { [key: string]: string },
): Promise<TransitTripPatterns> {
    const { searchDate, arriveBy } = searchParams

    const getTripPatternsParams = {
        ...searchParams,
        modes: filterModesAndSubModes(searchFilter),
    }

    // We do two searches in parallel here to speed things up a bit. One is a
    // flexible search where we explicitly look for trips that may include means
    // of transport that has to be booked in advance the second is a regular
    // search.
    const [
        flexibleResults,
        [regularTripPatternsUnfiltered, initialMetadata, routingErrors],
    ] = await Promise.all([
        searchFlexible(searchParams),
        getTripPatterns(getTripPatternsParams),
    ])

    let queries = [
        ...flexibleResults.queries,
        getTripPatternsQuery(getTripPatternsParams),
    ]

    let metadata = initialMetadata

    let regularTripPatterns = regularTripPatternsUnfiltered
        .filter(isValidTransitAlternative)
        .map(replaceQuay1ForOsloSWithUnknown)

    const nextSearchDateFromMetadata =
        metadata && getNextSearchDateFromMetadata(metadata, arriveBy)

    // Flexible may return results in the future that are outside the
    // original search window. There may still exist normal transport in the
    // time between the search window end and the first suggested flexible
    // result. For example, if  the search window ends on midnight Friday, and
    // the first suggested flexible result is on Monday morning, we can probably
    // still find a normal transport option on Saturday.

    // To find these so we do a new search if we found no regular trip patterns
    // within the original search window.
    const flexibleTripPattern = flexibleResults.tripPatterns[0]
    const hasFlexibleResultsOnly =
        flexibleTripPattern && !regularTripPatterns.length
    if (hasFlexibleResultsOnly) {
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

    // If we have any noStopsInRange errors, we couldn't find a means of
    // transport from where the traveler wants to start or end the trip. Try to
    // find an option using taxi for those parts instead.
    const noStopsInRangeErrors = routingErrors.filter(
        ({ code }) => code === RoutingErrorCode.noStopsInRange,
    )

    let taxiTripPatterns: Otp2TripPattern[] = []
    if (noStopsInRangeErrors.length > 0) {
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
        queries = [...taxiResults.queries]
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

    // Try again without taxi and flex searches until we either find something
    // or reach the maximum retries/maximum days back/forwards
    return searchTransitUntilMaxRetries(
        initialSearchDate,
        getTripPatternsParams,
        extraHeaders,
        queries,
    )
}

export type NonTransitMode =
    | StreetMode.FOOT
    | StreetMode.BICYCLE
    | StreetMode.CAR
    | StreetMode.BIKE_RENTAL

export async function searchNonTransit(
    params: SearchParams,
    modes: NonTransitMode[] = [
        StreetMode.FOOT,
        StreetMode.BICYCLE,
        StreetMode.CAR,
        StreetMode.BIKE_RENTAL,
    ],
): Promise<{
    tripPatterns: NonTransitTripPatterns
    queries: { [key in NonTransitMode]?: GraphqlQuery }
}> {
    const results = await Promise.all(
        modes.map(async (mode) => {
            const getTripPatternsParams = {
                ...params,
                limit: 1,
                allowBikeRental: mode === StreetMode.BIKE_RENTAL,
                modes: {
                    directMode: mode,
                    transportModes: [],
                },
            }

            const [result] = await getTripPatterns(getTripPatternsParams)
            const query = getTripPatternsQuery(getTripPatternsParams)

            const tripPattern = result[0]

            return { mode, tripPattern, query }
        }),
    )

    return results.reduce(
        (acc, { mode, tripPattern, query }) => {
            const m = mode === StreetMode.BIKE_RENTAL ? 'bicycle_rent' : mode
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
