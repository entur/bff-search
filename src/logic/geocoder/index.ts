import fetch from 'node-fetch'
import { sortBy } from '../../utils/array'
import logger from '../../logger'
import { GEOCODER_HOST } from '../../config'

const geocoderUrl = `${GEOCODER_HOST}/reverse`

export interface GeocoderFeature {
    geometry: {
        coordinates: [number, number] // lon, lat
    }
    properties: {
        id: string
        name: string
        distance: number
        category: string[]
    }
}

interface GeocoderResult {
    features?: GeocoderFeature[]
}

class GeocoderError extends Error {}

export const getNearestStops = async (
    lat: number,
    lon: number,
    maxDistKm: number,
): Promise<GeocoderFeature[]> => {
    const url = `${geocoderUrl}?point.lat=${lat}&point.lon=${lon}&boundary.circle.radius=${maxDistKm}&size=10&layers=venue&multiModal=child`

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'ET-Client-Name': 'entur-search',
        },
    })

    if (!response.ok) {
        const data = (await response.json()) as { message?: string }
        logger.error('Failure while fetching nearest stop', {
            lat,
            lon,
            maxDistKm,
            resHeaders: response.headers,
            resStatus: response.status,
            resData: data,
            url,
        })
        throw new GeocoderError(data.message)
    }

    const result = (await response.json()) as GeocoderResult
    const features = result.features || []
    return sortBy(features, (feature) => feature.properties.distance)
}
