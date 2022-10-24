import haversine from 'haversine'
import logger from '../../logger'
import { getNearestStops } from '../geocoder'
import { v4 as uuid } from 'uuid'
import { SearchParams, TripPatternParsed } from '../../types'

const MAX_DISTANCE_METERS = 30
const LOG_INTERVAL = 1000 * 60
const INSTANCE_ID = uuid()

// statistics counters
let totalChecks = 0

let stopPlacesWithoutCoordinates = 0

// searches starting within 30m of the user's current position
let shouldHaveFound = 0

// closest stopPlace and within 30m
let correctlyFound = 0

// real first stop place is within maxDistanceMeters of GPS position but wasn't found as any nearby stop
let missedCompletely = 0

// real first stop place is > maxDistanceMeters away
let tooFarAway = 0

// remember that 0 here is the number of cases with only 1 nearby stop etc
const nearbyCount: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

// ideally we want to find everything at index 0.
const foundAtIndex: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

// distance to correct stop place in groups of 10m (0-10, 10-20 etc)
const foundAtDistance: number[] = [0, 0, 0, 0, 0, 0]

const startTime = Date.now()
let lastLogTime = Date.now()

// This is a fragile way of detecting that the user has searched for 'your position' but currently it
// is the only way of knowing.
const myLocationTexts = ['Posisjonen din', 'Your location']

const logNearbyStatistics = (): void => {
    if (Date.now() - lastLogTime > LOG_INTERVAL) {
        lastLogTime = Date.now()
        const hitRate =
            Math.round((1000 * correctlyFound) / shouldHaveFound) / 10

        const logMeta = {
            instanceId: INSTANCE_ID,
            runningTime: `${Math.round((lastLogTime - startTime) / 1000)}s`,
            totalChecks,
            hitRate: {
                hitRate,
                shouldHaveFound,
                correctlyFound,
                missedCompletely, // missed even when looking at +20m
            },
            tooFarAway,
            foundAtIndex,
            foundAtDistance,
            stopPlacesWithoutCoordinates,
            distancesFromUserGPS: [
                ` 0 - 10m: ${foundAtDistance[0]}`,
                `10 - 20m: ${foundAtDistance[1]}`,
                `20 - 30m: ${foundAtDistance[2]}`,
                `30 - 40m: ${foundAtDistance[3]}`,
                `40 - 50m: ${foundAtDistance[4]}`,
                `50 - 60m: ${foundAtDistance[5]}`,
            ],
        }

        logger.info(
            `(id: ${INSTANCE_ID}) Nearby-matching: Hit rate ${hitRate} (${correctlyFound} of ${shouldHaveFound}). Expand for statistics`,
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
            // We add 20m to help us gather statistics about the best 'near' distance
            const maxDistMetersWithPadding = MAX_DISTANCE_METERS + 20
            const nearestStops = await getNearestStops(
                lat,
                lon,
                maxDistMetersWithPadding / 1000,
            )

            if (nearestStops.length === 0) {
                // No stops found within 30 meters, search from current 'my location'
                return
            }

            nearbyCount[nearestStops.length - 1]++

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
                stopPlacesWithoutCoordinates++
                return
            }

            // Distance to first stop found in search result
            const distanceToFirstStopInMeters = getDistanceInMeters(
                lat,
                lon,
                firstStopPlace.latitude,
                firstStopPlace.longitude,
            )

            if (distanceToFirstStopInMeters < maxDistMetersWithPadding) {
                shouldHaveFound++
            }

            const firstStopIndex = nearestStops.findIndex((nearbyStop) => {
                return nearbyStop.properties.id === firstStopPlaceId
            })

            if (firstStopIndex > -1) {
                foundAtIndex[firstStopIndex]++

                // in 10 mtrs
                const distanceToFirstStopRounded = Math.ceil(
                    distanceToFirstStopInMeters / 10,
                )
                if (distanceToFirstStopRounded > 5) {
                    logger.warning(
                        `Found distance to first stop to be ${distanceToFirstStopRounded}`,
                    )
                } else {
                    foundAtDistance[distanceToFirstStopRounded]++
                }

                if (
                    distanceToFirstStopInMeters <= MAX_DISTANCE_METERS &&
                    firstStopIndex === 0
                ) {
                    correctlyFound++
                }
            } else {
                if (distanceToFirstStopInMeters <= MAX_DISTANCE_METERS) {
                    // If distance is within max distance we SHOULD have found it
                    missedCompletely++
                } else {
                    tooFarAway++
                }
                logger.info(
                    `First stop is not part of nearby stops, real distance is ${distanceToFirstStopInMeters}`,
                    {
                        firstLegWithStopPlace,
                        nearestStops,
                    },
                )
            }
            totalChecks++
        }

        logNearbyStatistics()
    } catch (err) {
        logger.error('Error during stop place matching', err)
    }
}
