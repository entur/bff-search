import createEnturService, {
    LegMode,
    TripPattern,
    IntermediateEstimatedCall,
    Leg,
    Notice,
    Authority,
    TransportMode,
} from '@entur/sdk'
import { v4 as uuid } from 'uuid'
import {
    addDays,
    differenceInDays,
    endOfDay,
    startOfDay,
    subDays,
    parseISO,
    differenceInMinutes,
} from 'date-fns'

import {
    SearchParams,
    NonTransitTripPatterns,
    GraphqlQuery,
    Metadata,
    RoutingError,
    RoutingErrorCode,
} from '../../types'

import { isValidTransitAlternative } from '../../utils/tripPattern'
import { parseLeg } from '../../utils/leg'
import { replaceQuay1ForOsloSWithUnknown } from '../../utils/osloSTrack1Replacer'

import { TRANSIT_HOST_OTP2 } from '../../config'
import { GetTripPatternError, RoutingErrorsError } from '../../errors'

import JOURNEY_PLANNER_QUERY from './query'
import { filterModesAndSubModes, Mode } from './modes'

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

interface Otp2SearchParams extends Omit<SearchParams, 'modes'> {
    searchWindow?: number
    modes: Modes
}

// The stuff we actually send to journey planner
type Otp2BackendSearchParams = Omit<
    Otp2SearchParams,
    'initialSearchDate' | 'searchFilter'
>

interface TransitTripPatterns {
    tripPatterns: Otp2TripPattern[]
    hasFlexibleTripPattern?: boolean
    queries: GraphqlQuery[]
    metadata?: Metadata
}

// If any of these routing errors are received, there is no point in continuing the search.
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

type StreetMode =
    | 'foot'
    | 'bicycle'
    | 'bike_park'
    | 'bike_rental'
    | 'car'
    | 'car_park'
    | 'taxi'
    | 'car_rental'

interface Modes {
    accessMode: StreetMode
    egressMode: StreetMode
    directMode?: StreetMode
    transportModes: Mode[]
}

const DEFAULT_MODES: Modes = {
    accessMode: 'foot',
    egressMode: 'foot',
    transportModes: [
        { transportMode: TransportMode.BUS },
        { transportMode: TransportMode.TRAM },
        { transportMode: TransportMode.RAIL },
        { transportMode: TransportMode.METRO },
        { transportMode: TransportMode.WATER },
        { transportMode: TransportMode.AIR },
    ],
}

function getTripPatternsVariables(params: any): any {
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

function getTripPatternsQuery(params: Record<string, unknown>): GraphqlQuery {
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
        codeSpace: authority.id.split(':')[0],
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
                metadata: Metadata
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
        // TODO: trip cannot be null here, if it was routingErrors.some would crash above
        (res.trip?.tripPatterns || [])
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
    tripPatterns: Otp2TripPattern[],
    nextDateTime?: Date,
    flexibleTripPattern?: Otp2TripPattern,
    arriveBy = false,
): Otp2TripPattern[] {
    if (!flexibleTripPattern) return tripPatterns

    const sortedTripPatterns = sortTripPatternsByExpectedTime(
        [flexibleTripPattern, ...tripPatterns],
        arriveBy,
    )

    if (!nextDateTime) {
        return sortedTripPatterns
    }

    const flexIsOutsideTransitSearchWindowUsed = arriveBy
        ? parseISO(flexibleTripPattern.expectedEndTime) < nextDateTime
        : parseISO(flexibleTripPattern.expectedStartTime) > nextDateTime

    if (flexIsOutsideTransitSearchWindowUsed) {
        return tripPatterns
    }

    return sortedTripPatterns
}

async function searchBeforeFlexible(
    nextSearchDateFromMetadata: Date | undefined,
    searchDate: Date,
    arriveBy = false,
    flexibleTripPattern: Otp2TripPattern,
    searchParams: any,
) {
    const transitSearchDate = nextSearchDateFromMetadata || searchDate

    // TODO: What is changed here, increased range?
    const searchWindow = getMinutesBetweenDates(
        parseISO(
            arriveBy
                ? flexibleTripPattern.expectedEndTime
                : flexibleTripPattern.expectedStartTime,
        ),
        transitSearchDate,
        { min: 60 },
    )

    const nextSearchParams = {
        ...searchParams,
        searchDate: transitSearchDate,
        searchWindow,
    }

    const [transitResultsBeforeFlexible, beforeFlexibleMetadata] =
        await getTripPatterns(nextSearchParams)

    const beforeFlexibleTripPatterns = transitResultsBeforeFlexible.filter(
        isValidTransitAlternative,
    )

    const beforeFlexibleQueries = getTripPatternsQuery(nextSearchParams)
    return {
        beforeFlexibleQueries,
        beforeFlexibleMetadata,
        beforeFlexibleTripPatterns,
    }
}

export async function searchTransit(
    // TODO inialSearchDate and searchFilter should be completely separate.
    { initialSearchDate, searchFilter, ...searchParams }: Otp2SearchParams,
    extraHeaders: { [key: string]: string },
    // TODO This should be removed but is part of the interface at the moment.
    completelyUnusedParameter: undefined,
    options: { enableTaxiSearch?: boolean },
): Promise<TransitTripPatterns> {
    const { searchDate, arriveBy } = searchParams

    const getTripPatternsParams = {
        ...searchParams,
        modes: filterModesAndSubModes(searchFilter),
    }

    // TODO: Explain to joakim why are we doing two searches, what does flexible do
    const [flexibleResults, [response, initialMetadata, routingErrors]] =
        await Promise.all([
            searchFlexible(searchParams),
            getTripPatterns(getTripPatternsParams),
        ])

    // TODO: Can there be multiple noStopsInRangeErrors or could we assume one
    // and use that one instead of using .some later?
    const noStopsInRangeErrors = routingErrors.filter(
        ({ code }) => code === RoutingErrorCode.noStopsInRange,
    )

    let taxiResults: TransitTripPatterns | undefined
    if (options.enableTaxiSearch && noStopsInRangeErrors.length > 0) {
        taxiResults = await searchTaxiFrontBack(searchParams, {
            access: noStopsInRangeErrors.some((e) => e.inputField === 'from'),
            egress: noStopsInRangeErrors.some((e) => e.inputField === 'to'),
        })
    }

    let tripPatterns = response
        .filter(isValidTransitAlternative)
        // No, this hack doesn't feel good. But we get wrong data from the backend and
        // customers keep getting stuck on the wrong platform (31st of May 2021)
        .map(replaceQuay1ForOsloSWithUnknown)

    let metadata = initialMetadata

    // TODO: Spiller rekkefølgen her noen rolle??? For det første så UTFØRER vi det i en annen rekkefølge,
    // for det andre legger vi ting i resultatlisten i en tredje rekkefølge.
    let queries = [
        ...flexibleResults.queries,
        ...(taxiResults?.queries || []),
        getTripPatternsQuery(getTripPatternsParams),
    ]

    const nextSearchDateFromMetadata = metadata
        ? getNextSearchDateFromMetadata(metadata, arriveBy)
        : undefined

    // TODO: Why is this not possibly undefined?
    const flexibleTripPattern = flexibleResults.tripPatterns[0]
    const hasFlexibleResultsOnly = flexibleTripPattern && !tripPatterns.length
    if (hasFlexibleResultsOnly) {
        const {
            beforeFlexibleQueries,
            beforeFlexibleMetadata,
            beforeFlexibleTripPatterns,
        } = await searchBeforeFlexible(
            nextSearchDateFromMetadata,
            searchDate,
            arriveBy,
            flexibleTripPattern,
            getTripPatternsParams,
        )
        tripPatterns = beforeFlexibleTripPatterns
        metadata = beforeFlexibleMetadata
        queries = [...queries, beforeFlexibleQueries]
    }

    tripPatterns = [
        ...(taxiResults?.tripPatterns || []),
        // TODO: Denne kan risikere å ikke inkludere flexibleTripPattern.
        // MEN hasFlexibleTripPattern vil fortsatt returnere true. Er ikke det litt rart?
        ...combineAndSortFlexibleAndTransitTripPatterns(
            tripPatterns,
            nextSearchDateFromMetadata,
            flexibleTripPattern,
            arriveBy,
        ),
    ]

    if (tripPatterns.length) {
        return {
            tripPatterns,
            metadata,
            hasFlexibleTripPattern: Boolean(flexibleTripPattern),
            queries,
        }
    }

    // Try again without taxi and flex searches until we either find something or
    // reach the maximum retries/maximum days back/forwards
    return searchTransitUntilMaxRetries(
        initialSearchDate,
        getTripPatternsParams,
        extraHeaders,
        queries,
    )
}

export async function searchTransitUntilMaxRetries(
    initialSearchDate: Date,
    searchParams: Otp2BackendSearchParams,
    extraHeaders: { [key: string]: string },
    prevQueries: GraphqlQuery[],
): Promise<TransitTripPatterns> {
    const { searchDate, arriveBy } = searchParams

    const queries = [...prevQueries, getTripPatternsQuery(searchParams)]
    const [response, metadata] = await getTripPatterns(searchParams)

    const tripPatterns = response
        .filter(isValidTransitAlternative)
        // No, this hack doesn't feel good. But we get wrong data from the backend and
        // customers keep getting stuck on the wrong platform (31st of May 2021)
        .map(replaceQuay1ForOsloSWithUnknown)

    if (tripPatterns.length) {
        return {
            tripPatterns,
            metadata,
            hasFlexibleTripPattern: false,
            queries,
        }
    }

    // No trip patterns found so far, try again with a wider time range
    // TODO: Will metadata ever suddenly appear or disappear? If not, could we just make a loop
    // for each instead?
    if (metadata) {
        // TODO: Why do we use 15 queries here but not when we don't have metadata?
        if (queries.length > 15) {
            // We have tried as many times as we should but could not find
            // any trip patterns. Give up.
            return {
                tripPatterns: [],
                metadata: undefined, // TODO: Why is metadata undefined here
                hasFlexibleTripPattern: false,
                queries,
            }
        }

        // TODO: What is changed here, backwards/forwards in time
        const dateTime = arriveBy
            ? metadata.prevDateTime
            : metadata.nextDateTime

        const nextSearchParams = {
            ...searchParams,
            searchWindow: metadata.searchWindowUsed,
            searchDate: parseISO(dateTime),
        }

        // TODO: We should split out the parts of searchTransit that only run the first
        // time and have a cleaner method body that does not need all the checks
        return searchTransitUntilMaxRetries(
            initialSearchDate,
            nextSearchParams,
            extraHeaders,
            queries,
        )
    } else {
        // TODO: When do we not have metadata?
        const nextMidnight = arriveBy
            ? endOfDay(subDays(searchDate, 1))
            : startOfDay(addDays(searchDate, 1))

        // TODO: Why do we use 7 here but not above?
        if (Math.abs(differenceInDays(nextMidnight, initialSearchDate)) >= 7) {
            // We have tried as far back as we should but could not find
            // any trip patterns. Give up.
            return {
                tripPatterns: [],
                metadata,
                hasFlexibleTripPattern: false,
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

async function searchFlexible(searchParams: Otp2BackendSearchParams): Promise<{
    tripPatterns: Otp2TripPattern[]
    queries: GraphqlQuery[]
}> {
    const getTripPatternsParams = {
        ...searchParams,
        modes: {
            directMode: 'flexible',
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
                legs.length === 1 && legs[0].mode === LegMode.FOOT
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

async function searchTaxiFrontBack(
    searchParams: Otp2BackendSearchParams,
    options: { access: boolean; egress: boolean },
): Promise<TransitTripPatterns> {
    const { access, egress } = options

    const getTripPatternsParams = {
        ...searchParams,
        modes: {
            ...DEFAULT_MODES,
            accessMode: access ? 'car_pickup' : 'foot',
            egressMode: egress ? 'car_pickup' : 'foot',
        },
        numTripPatterns: egress && access ? 2 : 1,
    }

    const [tripPatterns] = await getTripPatterns(getTripPatternsParams)
    const queries = [getTripPatternsQuery(getTripPatternsParams)]

    /**
     * If no access or egress leg is necessary, we can get trip patterns with
     * no car legs. We therefore filter the results to prevent it from
     * returning results that the normal search also might return.
     */
    const taxiResults = tripPatterns.filter(({ legs }) =>
        legs.some(({ mode }) => mode === LegMode.CAR),
    )

    return {
        tripPatterns: taxiResults,
        queries,
    }
}

export type NonTransitMode = 'foot' | 'bicycle' | 'car' | 'bike_rental'

export async function searchNonTransit(
    params: SearchParams,
    modes: NonTransitMode[] = [
        LegMode.FOOT,
        LegMode.BICYCLE,
        LegMode.CAR,
        'bike_rental',
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
                allowBikeRental: mode === 'bike_rental',
                modes: {
                    accessMode: null,
                    egressMode: null,
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
            const m = mode === 'bike_rental' ? 'bicycle_rent' : mode
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
