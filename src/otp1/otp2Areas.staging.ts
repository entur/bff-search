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
        {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [
                        [10.36834716796875, 59.63512878739761],
                        [10.897064208984375, 59.63512878739761],
                        [10.897064208984375, 60.00447899694398],
                        [10.36834716796875, 60.00447899694398],
                        [10.36834716796875, 59.63512878739761],
                    ],
                ],
            },
        },
    ],
}

export default areas
