import haversine from 'haversine'
import logger from '../../logger'
import { getNearestStops } from '../geocoder'
import { v4 as uuid } from 'uuid'
import { SearchParams, TripPatternParsed } from '../../types'

const MAX_DISTANCE_METERS = 50
const LOG_INTERVAL = 1000 * 60
const INSTANCE_ID = uuid()

// statistics counters
let totalChecks = 0

// searches starting within 30m of the user's current position
let shouldHaveFound = 0

// closest stopPlace and within 30m
let suggestedCorrect = 0
let suggestedWrong = 0
let suggestionMissed = 0

const startTime = Date.now()
let lastLogTime = Date.now()

// This is a fragile way of detecting that the user has searched for 'your position' but currently it
// is the only way of knowing.
const myLocationTexts = ['Posisjonen din', 'Your location']

const logNearbyStatistics = (): void => {
    if (Date.now() - lastLogTime > LOG_INTERVAL) {
        lastLogTime = Date.now()
        const hitRate =
            Math.round((1000 * suggestedCorrect) / shouldHaveFound) / 10

        const logMeta = {
            instanceId: INSTANCE_ID,
            runningTime: `${Math.round((lastLogTime - startTime) / 1000)}s`,
            totalChecks,
            hitRate,
            // First stop in search result is within 50m of current position
            shouldHaveFound,
            suggestedCorrect,
            suggestedWrong,
            suggestionMissed,
        }

        logger.info(
            `(id: ${INSTANCE_ID}) Nearby-matching: Hit rate ${hitRate} (${suggestedCorrect} of ${shouldHaveFound}). Expand for statistics`,
            logMeta,
        )
    }
}

const getDistanceInMeters = (
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
): number => {
    const start = { latitude: fromLat, longitude: fromLon }
    const end = { latitude: toLat, longitude: toLon }
    return haversine(start, end, { unit: 'meter' })
}

export const runStopPlaceMatching = async (
    clientPlatform: string,
    params: SearchParams,
    tripPatterns: TripPatternParsed[],
): Promise<void> => {
    try {
        const lon = params.from.coordinates?.longitude
        const lat = params.from.coordinates?.latitude
        const isMyLocation = Boolean(
            params.from.name && myLocationTexts.includes(params.from.name),
        )

        const isApp = clientPlatform === 'APP'

        if (isApp && isMyLocation && tripPatterns.length !== 0 && lon && lat) {
            const nearestStops = await getNearestStops(
                lat,
                lon,
                MAX_DISTANCE_METERS / 1000,
            )

            if (nearestStops.length === 0) {
                // No stops found within 30 meters, search from current 'my location'
                return
            }

            const firstTripPattern = tripPatterns[0]
            const firstLegWithStopPlace = firstTripPattern?.legs.find(
                (leg) => leg.fromPlace.quay?.stopPlace != null,
            )

            if (!firstLegWithStopPlace) {
                logger.info(
                    'Could not find a stop place in the first trip pattern',
                )
                return
            }

            const firstStopPlaceId =
                firstLegWithStopPlace.fromPlace.quay?.stopPlace?.id || ''

            if (!firstStopPlaceId) {
                return
            }

            // When we get as far as this, we know we are able to compare an initial stopPlace with stops found nearby

            const firstStopPlace =
                firstLegWithStopPlace.fromPlace.quay?.stopPlace
            if (!firstStopPlace?.latitude || !firstStopPlace.longitude) {
                // not possible to do statistics so abort.
                return
            }

            // Distance to first stop found in search result
            const distanceToFirstStopInMeters = getDistanceInMeters(
                lat,
                lon,
                firstStopPlace.latitude,
                firstStopPlace.longitude,
            )

            if (distanceToFirstStopInMeters < MAX_DISTANCE_METERS) {
                shouldHaveFound++
                if (nearestStops.length > 0) {
                    const firstNearbyStop = nearestStops[0]
                    if (firstNearbyStop?.properties.id === firstStopPlaceId) {
                        suggestedCorrect++
                    } else {
                        suggestedWrong++
                    }
                } else {
                    // stop is within range but nothing was suggested
                    suggestionMissed++
                }
            }

            totalChecks++
        }

        logNearbyStatistics()
    } catch (err) {
        logger.error('Error during stop place matching', err)
    }
}
