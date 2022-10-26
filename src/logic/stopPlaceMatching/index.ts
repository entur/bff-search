import logger from '../../logger'
import { GeocoderFeature, getNearestStops } from '../geocoder'
import { SearchParams } from '../../types'
import { Location } from '../../generated/graphql'

const MAX_DISTANCE_METERS = 50

// This is a fragile way of detecting that the user has searched for 'your position' but currently it
// is the only way of knowing.
const myLocationTexts = ['Posisjonen din', 'Your location']
export const isMyLocation = (params: SearchParams): boolean =>
    Boolean(params.from.name && myLocationTexts.includes(params.from.name))

const mapToLocation = (feature: GeocoderFeature): Location | undefined => {
    const place = feature.properties.id
    const name = feature.properties.name
    const nearestCoord = feature.geometry.coordinates
    const latitude = nearestCoord[1]
    const longitude = nearestCoord[0]

    if (!place || !name || !latitude || !longitude) {
        return
    }

    return {
        place,
        name,
        // Coordinates must be null it seems, if not we search from the exact location which is not the same
        // as any of the quays?? May have been a fluke but this seems to work at least.
        coordinates: null,
    }
}

export const getNearestStopPlace = async (
    lon: number | undefined,
    lat: number | undefined,
): Promise<Location | undefined> => {
    if (!lon || !lat) {
        return
    }

    try {
        const nearestStops = await getNearestStops(
            lat,
            lon,
            MAX_DISTANCE_METERS / 1000,
        )

        if (nearestStops.length === 0 || !nearestStops[0]) {
            return
        }

        return mapToLocation(nearestStops[0])
    } catch (error) {
        logger.error('Something went wrong during nearest stop detection', {
            error,
        })
    }
}
