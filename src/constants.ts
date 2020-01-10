export const NON_TRANSIT_DISTANCE_LIMITS = {
    UPPER: {
        bicycle: 100000,
        car: 120000,
        foot: 100000,
    },
    LOWER: {
        foot: 1,
        bicycle: 1,
        car: 1,
    },
}

export const THRESHOLD = {
    TAXI_HOURS: 4,
    TAXI_WALK: 20 * 60,
    TAXI_CAR: 15 * 60,
}
