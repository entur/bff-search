import { FeatureCollection, Polygon } from 'geojson'

const LATITUDE_THRESHOLD = 67.5

const areas: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [
                        [5, LATITUDE_THRESHOLD],
                        [34, LATITUDE_THRESHOLD],
                        [34, 72],
                        [5, 72],
                        [5, LATITUDE_THRESHOLD],
                    ],
                ],
            },
        },
    ],
}

export default areas
