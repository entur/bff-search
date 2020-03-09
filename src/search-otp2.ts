import createEnturService, {
    getTripPatternsQuery,
    LegMode,
    TripPattern,
    QueryMode,
    IntermediateEstimatedCall,
    Leg,
    Notice,
    Authority,
} from '@entur/sdk'
import { differenceInHours } from 'date-fns'

import { SearchParams, TransitTripPatterns, NonTransitTripPatterns, GraphqlQuery } from '../types'

import {
    isBikeRentalAlternative,
    isFlexibleAlternative,
    isValidTransitAlternative,
    isValidNonTransitDistance,
    parseTripPattern,
} from './utils/tripPattern'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: process.env.JOURNEY_PLANNER_V3_HOST,
    },
})

const JOURNEY_PLANNER_QUERY = `
query (
    $numTripPatterns: Int!,
    $from: Location!,
    $to: Location!,
    $dateTime: DateTime!,
    $arriveBy: Boolean!,
    $wheelchair: Boolean!,
    $modes: [Mode]!,
    $transportSubmodes: [TransportSubmodeFilter],
    $maxPreTransitWalkDistance: Float,
    $walkSpeed: Float,
    $minimumTransferTime: Int,
    $allowBikeRental: Boolean,
    $useFlex: Boolean,
    $banned: InputBanned,
    $whiteListed: InputWhiteListed,
    $debugItineraryFilter: Boolean,
) {
    trip(
        numTripPatterns: $numTripPatterns,
        from: $from,
        to: $to,
        dateTime: $dateTime,
        arriveBy: $arriveBy,
        wheelchair: $wheelchair,
        modes: $modes,
        transportSubmodes: $transportSubmodes,
        maxPreTransitWalkDistance: $maxPreTransitWalkDistance,
        walkSpeed: $walkSpeed,
        minimumTransferTime: $minimumTransferTime,
        allowBikeRental: $allowBikeRental,
        useFlex: $useFlex,
        banned: $banned,
        whiteListed: $whiteListed,
        debugItineraryFilter: $debugItineraryFilter
    ) {
      metadata {
        searchWindowUsed
        nextDateTime
        prevDateTime
      }
      tripPatterns {
        startTime
        endTime
        directDuration
        duration
        distance
        walkDistance
        legs {
          ...legFields
        }
      }
    }
  }

  fragment legFields on Leg {
    aimedEndTime
    aimedStartTime
    authority {
      ...authorityFields
    }
    distance
    directDuration
    duration
    expectedEndTime
    expectedStartTime
    fromEstimatedCall {
      ...estimatedCallFields
    }
    fromPlace {
      ...placeFields
    }
    interchangeFrom {
      ...interchangeFields
    }
    interchangeTo {
      ...interchangeFields
    }
    intermediateEstimatedCalls {
      ...estimatedCallFields
    }
    line {
      ...lineFields
    }
    mode
    operator {
      ...operatorFields
    }
    pointsOnLink {
      ...pointsOnLinkFields
    }
    realtime
    ride
    rentedBike
    serviceJourney {
      ...serviceJourneyFields
    }
    situations {
      ...situationFields
    }
    toEstimatedCall {
      ...estimatedCallFields
    }
    toPlace {
      ...placeFields
    }
    transportSubmode
  }

  fragment lineFields on Line {
    bookingArrangements {
      ...bookingArrangementFields
    }
    description
    flexibleLineType
    id
    name
    notices {
      ...noticeFields
    }
    publicCode
    transportMode
    transportSubmode
  }

  fragment bookingArrangementFields on BookingArrangement {
    bookingMethods
    bookingNote
    minimumBookingPeriod
    bookingContact {
      phone
      url
    }
  }

  fragment noticeFields on Notice {
    text
  }

  fragment placeFields on Place {
    name
    latitude
    longitude
    quay {
      ...quayFields
    }
    bikeRentalStation {
      ...bikeRentalStationFields
    }
  }

  fragment quayFields on Quay {
    id
    name
    description
    publicCode
    situations {
      ...situationFields
    }
    stopPlace {
      ...stopPlaceFields
    }
  }

  fragment situationFields on PtSituationElement {
    situationNumber
    summary {
      language
      value
    }
    description {
      language
      value
    }
    detail {
      language
      value
    }
    lines {
      ...lineFields
    }
    validityPeriod {
      startTime
      endTime
    }
    reportType
    infoLinks {
      uri
      label
    }
  }

  fragment stopPlaceFields on StopPlace {
    id
    description
    name
    tariffZones {
      id
    }
  }

  fragment bikeRentalStationFields on BikeRentalStation {
    id
    name
    networks
    bikesAvailable
    spacesAvailable
    longitude
    latitude
  }

  fragment authorityFields on Authority {
    id
    name
    url
  }

  fragment operatorFields on Operator {
    id
    name
    url
  }

  fragment serviceJourneyFields on ServiceJourney {
    id
    journeyPattern {
      line {
        ...lineFields
      }
      notices {
        ...noticeFields
      }
    }
    notices {
      ...noticeFields
    }
    publicCode
    transportSubmode
  }

  fragment interchangeFields on Interchange {
    guaranteed
    staySeated
  }

  fragment pointsOnLinkFields on PointsOnLink {
    points
    length
  }

  fragment estimatedCallFields on EstimatedCall {
    actualArrivalTime
    actualDepartureTime
    aimedArrivalTime
    aimedDepartureTime
    cancellation
    date
    destinationDisplay {
      frontText
    }
    expectedDepartureTime
    expectedArrivalTime
    forAlighting
    forBoarding
    notices {
      ...noticeFields
    }
    quay {
      ...quayFields
    }
    realtime
    requestStop
    serviceJourney {
      ...serviceJourneyFields
    }
    situations {
      ...situationFields
    }
  }
`

const DEFAULT_MODES: QueryMode[] = ['foot', 'bus', 'tram', 'rail', 'metro', 'water', 'air']

function getTripPatternsVariables(params: any): any {
    const {
        from,
        to,
        searchDate = new Date(),
        arriveBy = false,
        modes = DEFAULT_MODES,
        transportSubmodes = [],
        wheelchairAccessible = false,
        limit = 5,
        ...rest
    } = params || {}

    return {
        ...rest,
        from,
        to,
        dateTime: searchDate.toISOString(),
        arriveBy,
        modes,
        transportSubmodes,
        wheelchair: wheelchairAccessible,
        numTripPatterns: limit,
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

function getNoticesFromIntermediateEstimatedCalls(estimatedCalls: IntermediateEstimatedCall[]): Notice[] {
    if (!estimatedCalls?.length) return []
    return estimatedCalls.map(({ notices }) => notices || []).reduce((a, b) => [...a, ...b], [])
}
function getNotices(leg: Leg): Notice[] {
    const notices = [
        ...getNoticesFromIntermediateEstimatedCalls(leg.intermediateEstimatedCalls),
        ...(leg.serviceJourney?.notices || []),
        ...(leg.serviceJourney?.journeyPattern?.notices || []),
        ...(leg.serviceJourney?.journeyPattern?.line?.notices || []),
        ...(leg.fromEstimatedCall?.notices || []),
        ...(leg.toEstimatedCall?.notices || []),
        ...(leg.line?.notices || []),
    ]
    return uniqBy(notices, notice => notice.text)
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

export interface Metadata {
    searchWindowUsed: number
    nextDateTime: string
    prevDateTime: string
}

async function getTripPatterns(params: any): Promise<[TripPattern[], Metadata | undefined]> {
    const res = await sdk.queryJourneyPlanner<{
        trip: { metadata: Metadata; tripPatterns: any[] }
    }>(JOURNEY_PLANNER_QUERY, getTripPatternsVariables(params))

    const { metadata } = res.trip

    return [
        (res.trip?.tripPatterns || []).map((pattern: any) => ({
            ...pattern,
            legs: pattern.legs.map(legMapper),
        })),
        metadata,
    ]
}

export async function searchTransit(
    params: SearchParams,
    extraHeaders: { [key: string]: string },
    prevQueries?: GraphqlQuery[],
): Promise<TransitTripPatterns & { metadata?: Metadata }> {
    const { initialSearchDate, ...searchParams } = params
    const { searchDate } = searchParams

    const getTripPatternsParams = {
        ...searchParams,
        useFlex: true,
        maxPreTransitWalkDistance: 2000,
    }

    const [response, metadata] = await getTripPatterns(getTripPatternsParams)

    const query = getTripPatternsQuery(getTripPatternsParams)
    const queries = [...(prevQueries || []), query]

    const tripPatterns = response.map(parseTripPattern).filter(isValidTransitAlternative)

    const searchTimeWithinRange = differenceInHours(searchDate, initialSearchDate) < 12

    if (!tripPatterns.length && searchTimeWithinRange && metadata) {
        const nextSearchParams = { ...params, searchDate: new Date(metadata.nextDateTime) }
        return searchTransit(nextSearchParams, extraHeaders, queries)
    }

    return {
        tripPatterns,
        metadata,
        hasFlexibleTripPattern: tripPatterns.some(isFlexibleAlternative),
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
