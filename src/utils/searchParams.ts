import { Location } from '../generated/graphql'

export function deriveSearchParamsId(tripPatternId: string): string {
    return tripPatternId.substring(0, 23)
}

export function filterCoordinates(location: Location): Location {
    const coordinates = location.coordinates

    if (coordinates && coordinates.latitude && coordinates.longitude)
        return location

    return { ...location, coordinates: null }
}
