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

export const TAXI_LIMITS = {
    DURATION_MAX_HOURS: 4,
    DURATION_MIN_SECONDS: 5 * 60,
    CAR_ALTERNATIVE_MIN_SECONDS: 15 * 60,
    FOOT_ALTERNATIVE_MIN_SECONDS: 20 * 60,
}
