const EnturService = require("@entur/sdk").default;

const sdk = new EnturService({
    clientName: "entur-search",
    hosts: {
        journeyplanner: "https://api.dev.entur.io/sales/v1/offers/search",
    },
});

const NON_TRANSIT_DISTANCE_LIMITS = {
    UPPER: {
        foot: 100000,
        bicycle: 100000,
        car: 120000,
    },
    LOWER: {
        foot: 1,
        bicycle: 1,
        car: 1,
    },
};

function shouldSearchWithTaxi(tripPatterns, nonTransitTripPatterns) {
    if (!tripPatterns.length) { return true; }
    const { walk, car } = nonTransitTripPatterns;
    if (walk && walk.duration < THRESHOLD.TAXI_WALK) { return false; }
    if (car && car.duration < THRESHOLD.TAXI_CAR) { return false; }
    const timeUntilResult = timeBetweenSearchDateAndResult(originalSearchTime, tripPatterns[0], timepickerMode);
    return timeUntilResult >= THRESHOLD.TAXI_HOURS;
}

async function getNonTransitTripPatterns(from, to, searchParams) {
    const nonTransitTripPatterns = await Promise.all(["foot", "bicycle", "car"].map(async mode => {
        const result = await sdk.getTripPatterns(from, to, {
            ...searchParams,
            modes: [mode],
        });

        if (!result || !result.length) { return; }

        const pattern = result[0];

        const upperLimit = NON_TRANSIT_DISTANCE_LIMITS.UPPER[mode];
        const lowerLimit = NON_TRANSIT_DISTANCE_LIMITS.LOWER[mode];
        if (pattern.distance > upperLimit || pattern.distance < lowerLimit) { return; }

        return pattern;
    }));

    return nonTransitTripPatterns.filter(Boolean);
}

module.exports = async function search(params, options) {
    const { from, to, ...searchParams } = params;
    const [transit, nonTransit] = await Promise.all([
        sdk.getTripPatterns(from, to, searchParams),
        options.ignoreNonTransit ? [] : getNonTransitTripPatterns(from, to, searchParams),
    ]);
    return [...transit, ...nonTransit];
};
