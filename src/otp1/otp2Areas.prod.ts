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
                        [5, 63.15],
                        [34, 63.15],
                        [34, 72],
                        [5, 72],
                        [5, 63.15],
                    ],
                ],
            },
        },
    ],
}

export default areas
