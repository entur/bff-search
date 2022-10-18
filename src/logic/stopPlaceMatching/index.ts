import haversine from 'haversine'
import logger from '../../logger'
import { getNearestStops } from '../geocoder'
import { v4 as uuid } from 'uuid'
import { SearchParams, TripPatternParsed } from '../../types'

const maxDistanceMeters = 30
const instanceId = uuid()
const logInterval = 1000 * 60

let matchTries = 0

// closest stopPlace and within 30m
let correctlyFound = 0

// real first stop place is within maxDistanceMeters of GPS position
let missedButShouldHaveBeenFound = 0

// real first stop place is > maxDistanceMeters away
let tooFarAway = 0

// remember that 0 here is the number of cases with only 1 nearby stop etc
const nearbyCount: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const foundAtIndex: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const foundAtDistance: number[] = [0, 0, 0, 0, 0, 0]
const startTime = Date.now()
const lastLogTime = Date.now()

// This is a fragile way of detecting that the user has searched for 'your position' but currently it
// is the only way of knowing.
const myLocationTexts = ['Posisjonen din', 'Your location']

const logNearbyStatistics = (): void => {
    if (Date.now() - lastLogTime > logInterval) {
        const hitRate = Math.round((1000 * correctlyFound) / matchTries) / 10
        logger.info(
            `(id: ${instanceId}) Nearby-matching: Hit rate ${hitRate}. Expand for statistics`,
            {
                instanceId,
                runningTime: `${Math.round((lastLogTime - startTime) / 1000)}s`,
                matchTries,
                correctlyFound,
                missedButShouldHaveBeenFound,
                tooFarAway,
                foundAtIndex,
                foundAtDistance,
                distancesFromUserGPS: [
                    ` 0 - 10m: ${foundAtDistance[0]}`,
                    `10 - 20m: ${foundAtDistance[1]}`,
                    `20 - 30m: ${foundAtDistance[2]}`,
                    `30 - 40m: ${foundAtDistance[3]}`,
                    `40 - 50m: ${foundAtDistance[4]}`,
                    `50 - 60m: ${foundAtDistance[5]}`,
                ],
            },
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
        const isMyLocation = myLocationTexts.includes(params.from.name || '')
        const isApp = clientPlatform === 'APP'

        if (isApp && isMyLocation && tripPatterns.length !== 0 && lon && lat) {
            // We add 20m to help us gather statistics about the best 'near' distance
            const maxDistKm = maxDistanceMeters / 100 + 0.02
            const nearestStops = await getNearestStops(lat, lon, maxDistKm)

            logger.info(`Found ${nearestStops.length} stops nearby`, {
                nearestStops,
            })

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

            // When we get as far as this, we know we are able to compare an intitial stopPlace with stops found nearby

            const firstStopIndex = nearestStops.findIndex((nearbyStop) => {
                return nearbyStop.properties.id === firstStopPlaceId
            })

            if (firstStopIndex > -1) {
                foundAtIndex[firstStopIndex]++

                const distanceToFirstStop =
                    nearestStops[firstStopIndex]?.properties.distance
                if (!distanceToFirstStop) return

                // in 10 mtrs
                const distanceToFirstStopRounded = Math.ceil(
                    distanceToFirstStop * 100,
                )
                foundAtDistance[distanceToFirstStopRounded]++

                if (distanceToFirstStop < maxDistanceMeters) correctlyFound++
            } else {
                const firstStopPlace =
                    firstLegWithStopPlace.fromPlace.quay?.stopPlace
                if (firstStopPlace?.latitude && firstStopPlace.longitude) {
                    const distanceToFirstStop = getDistanceInMeters(
                        lat,
                        lon,
                        firstStopPlace.latitude,
                        firstStopPlace.longitude,
                    )
                    if (distanceToFirstStop < maxDistanceMeters) {
                        missedButShouldHaveBeenFound++
                    } else {
                        tooFarAway++
                    }
                    logger.info(
                        `First stop is not part of nearby stops, real distance is ${distanceToFirstStop}`,
                        {
                            firstLegWithStopPlace,
                            nearestStops,
                        },
                    )
                }
            }
            matchTries++

            logNearbyStatistics()
        }
    } catch (err) {
        logger.error('Error during stop place matching', err)
    }
}
