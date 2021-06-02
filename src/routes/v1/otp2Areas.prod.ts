import { FeatureCollection, Polygon } from 'geojson'

const LATITUDE_THRESHOLD = 63.15

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
