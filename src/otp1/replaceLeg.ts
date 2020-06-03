import fetch from 'node-fetch'
import { getTripPatternsQuery, TripPattern, Leg, LegMode, QueryMode } from '@entur/sdk'

import { SearchParams } from '../../types'
import { TRANSIT_HOST } from '../config'
import { InvalidArgumentError, JourneyPlannerError } from '../errors'
import { uniq, sortBy } from '../utils/array'
import { createParseTripPattern } from '../utils/tripPattern'
import { isTransitLeg } from '../utils/leg'

async function post<T>(url: string, params: object): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(params),
        headers: {
            'Content-Type': 'application/json',
            'ET-Client-Name': 'entur-search',
        },
    })

    if (!response.ok) {
        const data = await response.json()
        throw new JourneyPlannerError(data.message)
    }

    return response.json()
}

interface SearchLimits {
    numEarlierTripPatterns: number
    numLaterTripPatterns: number
}
function getSearchLimits(tripPattern: TripPattern, leg: Leg): SearchLimits {
    const transitLegs = tripPattern.legs.filter(isTransitLeg)
    const hasMultipleLegs = transitLegs.length > 1
    const isFirstOfMultipleLegs = transitLegs.indexOf(leg) === 0 && hasMultipleLegs

    if (isFirstOfMultipleLegs) {
        return {
            numEarlierTripPatterns: 8,
            numLaterTripPatterns: 2,
        }
    }

    const isLastOfMultipleLegs = transitLegs.indexOf(leg) === transitLegs.length - 1 && hasMultipleLegs

    if (isLastOfMultipleLegs) {
        return {
            numEarlierTripPatterns: 2,
            numLaterTripPatterns: 8,
        }
    }

    return {
        numEarlierTripPatterns: 5,
        numLaterTripPatterns: 5,
    }
}

function findLeg(legs: Leg[], id: string): Leg | undefined {
    return legs.find((leg) => leg.serviceJourney?.id === id)
}

function fuzzyFindLeg(leg: Leg, legs: Leg[] = []): Leg | undefined {
    const {
        fromPlace: { name: fromPlaceName },
        toPlace: { name: toPlaceName },
    } = leg

    return legs.find((currentLeg, index) => {
        const { interchangeTo, fromPlace, toPlace } = currentLeg
        const nextToPlace = interchangeTo?.staySeated ? legs[index + 1]?.toPlace : undefined

        return fromPlace.name === fromPlaceName && (toPlace.name === toPlaceName || nextToPlace?.name === toPlaceName)
    })
}

function getLegId({ mode, serviceJourney, aimedStartTime }: Leg): string {
    const id = serviceJourney?.id || mode
    return `${id}:${aimedStartTime}`
}

function uniqTripPatterns(tripPatterns: TripPattern[], legToReplace: Leg): TripPattern[] {
    const seen: string[] = []
    return tripPatterns.filter(({ legs }) => {
        const matchingLeg = fuzzyFindLeg(legToReplace, legs)
        if (!matchingLeg || !isTransitLeg(matchingLeg)) return false

        const legId = getLegId(matchingLeg)
        if (seen.includes(legId)) return false

        // eslint-disable-next-line fp/no-mutating-methods
        seen.push(legId)
        return true
    })
}

function toQueryMode(legMode: LegMode): QueryMode {
    if (legMode === 'unknown') return 'bus'
    return legMode
}

interface QueryError {
    errorType: 'ValidationError'
    message: string
}
interface ReplaceLegResponse {
    data: {
        trip: {
            tripPatterns: TripPattern[]
        }
    }
    errors?: QueryError[]
}
export async function getAlternativeTripPatterns(
    originalTripPattern: TripPattern,
    replaceLegServiceJourneyId: string,
    searchParams: SearchParams,
): Promise<TripPattern[]> {
    const url = `${TRANSIT_HOST}/trip-patterns/replace-leg`

    const legToReplace = findLeg(originalTripPattern.legs, replaceLegServiceJourneyId)
    if (!legToReplace) {
        throw new InvalidArgumentError(`Found no legs with service journey id ${replaceLegServiceJourneyId}`)
    }

    const modes: QueryMode[] = uniq(['foot', ...originalTripPattern.legs.map((l) => toQueryMode(l.mode))])

    const originalRequest = getTripPatternsQuery({
        ...searchParams,
        modes,
    })

    const { numEarlierTripPatterns, numLaterTripPatterns } = getSearchLimits(originalTripPattern, legToReplace)

    const { data, errors } = await post<ReplaceLegResponse>(url, {
        originalRequest,
        originalTripPattern,
        replaceLegServiceJourneyId,
        numEarlierTripPatterns,
        numLaterTripPatterns,
    })

    if (errors?.[0]) {
        const { errorType, message } = errors[0]
        throw new JourneyPlannerError(`${errorType}: ${message}`)
    }

    const { trip } = data
    const parseTripPattern = createParseTripPattern()
    const tripPatterns = [originalTripPattern, ...trip.tripPatterns].map(parseTripPattern)
    const filteredTripPatterns = uniqTripPatterns(tripPatterns, legToReplace)

    return sortBy(filteredTripPatterns, ({ legs }) => {
        const matchingLeg = fuzzyFindLeg(legToReplace, legs)
        return matchingLeg?.expectedStartTime || matchingLeg?.aimedStartTime || '_'
    })
}
