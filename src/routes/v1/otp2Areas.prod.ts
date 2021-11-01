import { FeatureCollection, Polygon } from 'geojson'

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
                        [0, 58],
                        [6, 58],
                        [7, 59],
                        [34, 58],
                        [34, 72],
                        [0, 72],
                        [0, 58],
                    ],
                ],
            },
        },
    ],
}

export default areas
