// import fetch from 'node-fetch'
// import { v4 as uuid } from 'uuid'
// import { getTripPatternsQuery, QueryMode } from '@entur/sdk'

// import { Leg, SearchParams, TripPattern, TripPatternParsed } from '../../types'
// import { TRANSIT_HOST } from '../../config'
// import { InvalidArgumentError, JourneyPlannerError } from '../../errors'
// import { uniq, sortBy } from '../../utils/array'

// import { Mode } from '../../generated/graphql'

// function isTransitLeg(leg: Leg): boolean {
//     const { mode } = leg
//     return mode !== Mode.Foot && mode !== Mode.Bicycle && mode !== Mode.Car
// }

// function isFlexibleLeg(leg: Leg): boolean {
//     return leg.line?.flexibleLineType === 'flexibleAreasOnly'
// }

// // Replaces `leg.mode` from the OTP result from `coach` to `bus`.
// // In the future we might want to handle buses and coaches differently,
// // but for now, all coaches will be treated as buses in the app.
// function coachLegToBusLeg(leg: Leg): Leg {
//     return {
//         ...leg,
//         mode: leg.mode === Mode.Coach ? Mode.Bus : leg.mode,
//     }
// }

// function parseLeg(leg: Leg): Leg {
//     const { fromPlace, fromEstimatedCall } = leg
//     const fromQuayName = fromPlace?.quay?.name || fromEstimatedCall?.quay?.name
//     const parsedLeg =
//         isFlexibleLeg(leg) || !fromQuayName
//             ? leg
//             : {
//                   ...leg,
//                   fromPlace: {
//                       ...fromPlace,
//                       name: isTransitLeg(leg) ? fromQuayName : fromPlace.name,
//                   },
//               }

//     return coachLegToBusLeg(parsedLeg)
// }

// function parseTripPattern(rawTripPattern: any): TripPatternParsed {
//     return {
//         ...rawTripPattern,
//         id: rawTripPattern.id || uuid(),
//         legs: rawTripPattern.legs.map(parseLeg),
//         genId: `${new Date().getTime()}:${Math.random()
//             .toString(36)
//             .slice(2, 12)}`,
//     }
// }

// function createParseTripPattern(): (rawTripPattern: any) => TripPatternParsed {
//     let i = 0
//     const sharedId = uuid()
//     const baseId = sharedId.substring(0, 23)
//     const iterator = parseInt(sharedId.substring(24), 16)

//     return (rawTripPattern: any): TripPatternParsed => {
//         i++
//         const id = `${baseId}-${(iterator + i).toString(16).slice(-12)}`
//         return parseTripPattern({ id, ...rawTripPattern })
//     }
// }

// async function post<T>(
//     url: string,
//     params: Record<string, unknown>,
// ): Promise<T> {
//     const response = await fetch(url, {
//         method: 'POST',
//         body: JSON.stringify(params),
//         headers: {
//             'Content-Type': 'application/json',
//             'ET-Client-Name': 'entur-search',
//         },
//     })

//     if (!response.ok) {
//         const data = await response.json()
//         throw new JourneyPlannerError(data.message)
//     }

//     return response.json()
// }

// interface SearchLimits {
//     numEarlierTripPatterns: number
//     numLaterTripPatterns: number
// }
// function getSearchLimits(tripPattern: TripPattern, leg: Leg): SearchLimits {
//     const transitLegs = tripPattern.legs.filter(isTransitLeg)
//     const hasMultipleLegs = transitLegs.length > 1
//     const isFirstOfMultipleLegs =
//         transitLegs.indexOf(leg) === 0 && hasMultipleLegs

//     if (isFirstOfMultipleLegs) {
//         return {
//             numEarlierTripPatterns: 8,
//             numLaterTripPatterns: 2,
//         }
//     }

//     const isLastOfMultipleLegs =
//         transitLegs.indexOf(leg) === transitLegs.length - 1 && hasMultipleLegs

//     if (isLastOfMultipleLegs) {
//         return {
//             numEarlierTripPatterns: 2,
//             numLaterTripPatterns: 8,
//         }
//     }

//     return {
//         numEarlierTripPatterns: 5,
//         numLaterTripPatterns: 5,
//     }
// }

// function findLeg(legs: Leg[], id: string): Leg | undefined {
//     return legs.find((leg) => leg && leg.serviceJourney?.id === id) || undefined
// }

// function fuzzyFindLeg(leg: Leg, legs: Leg[] = []): Leg | undefined {
//     const {
//         fromPlace: { name: fromPlaceName },
//         toPlace: { name: toPlaceName },
//     } = leg

//     return (
//         legs.find((currentLeg, index) => {
//             if (!currentLeg) return false
//             const { interchangeTo, fromPlace, toPlace } = currentLeg
//             const nextToPlace = interchangeTo?.staySeated
//                 ? legs[index + 1]?.toPlace
//                 : undefined

//             return (
//                 fromPlace.name === fromPlaceName &&
//                 (toPlace.name === toPlaceName ||
//                     nextToPlace?.name === toPlaceName)
//             )
//         }) || undefined
//     )
// }

// function getLegId({ mode, serviceJourney, aimedStartTime }: Leg): string {
//     const id = serviceJourney?.id || mode
//     return `${id}:${aimedStartTime}`
// }

// function uniqTripPatterns(
//     tripPatterns: TripPatternParsed[],
//     legToReplace: Leg,
// ): TripPatternParsed[] {
//     const seen: string[] = []
//     return tripPatterns.filter(({ legs }) => {
//         const matchingLeg = fuzzyFindLeg(legToReplace, legs)
//         if (!matchingLeg || !isTransitLeg(matchingLeg)) return false

//         const legId = getLegId(matchingLeg)
//         if (seen.includes(legId)) return false

//         // eslint-disable-next-line fp/no-mutating-methods
//         seen.push(legId)
//         return true
//     })
// }

// function toQueryMode(legMode: Mode): QueryMode {
//     // Mode is a subset of QueryMode, so casting is safe in this case
//     return legMode as unknown as QueryMode
// }

// interface QueryError {
//     errorType: 'ValidationError'
//     message: string
// }
// interface ReplaceLegResponse {
//     data: {
//         trip: {
//             tripPatterns: TripPattern[]
//         }
//     }
//     errors?: QueryError[]
// }
// export async function getAlternativeTripPatterns(
//     originalTripPattern: TripPatternParsed,
//     replaceLegServiceJourneyId: string,
//     searchParams: SearchParams,
// ): Promise<TripPatternParsed[]> {
//     const url = `${TRANSIT_HOST}/trip-patterns/replace-leg`

//     const legToReplace = findLeg(
//         originalTripPattern.legs,
//         replaceLegServiceJourneyId,
//     )
//     if (!legToReplace) {
//         throw new InvalidArgumentError(
//             `Found no legs with service journey id ${replaceLegServiceJourneyId}`,
//         )
//     }

//     const modes: QueryMode[] = uniq([
//         QueryMode.FOOT,
//         ...originalTripPattern.legs.map((l) => toQueryMode(l.mode)),
//     ])

//     const originalRequest = getTripPatternsQuery({
//         ...searchParams,
//         modes,
//     })

//     const { numEarlierTripPatterns, numLaterTripPatterns } = getSearchLimits(
//         originalTripPattern,
//         legToReplace,
//     )

//     const { data, errors } = await post<ReplaceLegResponse>(url, {
//         originalRequest,
//         originalTripPattern,
//         replaceLegServiceJourneyId,
//         numEarlierTripPatterns,
//         numLaterTripPatterns,
//     })

//     if (errors?.[0]) {
//         const { errorType, message } = errors[0]
//         throw new JourneyPlannerError(`${errorType}: ${message}`)
//     }

//     const { trip } = data
//     const parseTripPatternFunc = createParseTripPattern()
//     const tripPatterns = [originalTripPattern, ...trip.tripPatterns].map(
//         parseTripPatternFunc,
//     )

//     const filteredTripPatterns = uniqTripPatterns(tripPatterns, legToReplace)

//     return sortBy(filteredTripPatterns, ({ legs }) => {
//         const matchingLeg = fuzzyFindLeg(legToReplace, legs)
//         return (
//             matchingLeg?.expectedStartTime || matchingLeg?.aimedStartTime || '_'
//         )
//     })
// }
