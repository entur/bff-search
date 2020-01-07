const EnturService = require('@entur/sdk').default

const sdk = new EnturService({
    clientName: 'entur-search',
    hosts: {
        journeyplanner: 'https://api.dev.entur.io/sales/v1/offers/search'
    }
})

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
}

function shouldSearchWithTaxi(tripPatterns, nonTransitTripPatterns) {
    if (!tripPatterns.length) return true
    const { walk, car } = nonTransitTripPatterns
    if (walk && walk.duration < THRESHOLD.TAXI_WALK) return false
    if (car && car.duration < THRESHOLD.TAXI_CAR) return false
    const timeUntilResult = timeBetweenSearchDateAndResult(originalSearchTime, tripPatterns[0], timepickerMode)
    return timeUntilResult >= THRESHOLD.TAXI_HOURS
}

exports.transit = async function transit(params) {
    console.log('TRANSIT params :', JSON.stringify(params, undefined, 3));

    const { from, to, ...searchParams } = params

    return sdk.getTripPatterns(from, to, searchParams)
}

exports.nontransit = async function nontransit(params) {
    console.log('NON-TRANSIT params :', JSON.stringify(params, undefined, 3));

    const { from, to, ...searchParams } = params
    const modes = ['foot', 'bicycle', 'car']
    const [foot, bicycle, car] = await Promise.all(modes.map(async mode => {
        const result = await sdk.getTripPatterns(from, to, {
            ...searchParams,
            numTripPatterns: 1,
            modes: [mode],
            transportSubmodes: [],
            maxPreTransitWalkDistance: 2000,
        })

        if (!result || !result.length) return

        const pattern = result[0]
        const upperLimit = NON_TRANSIT_DISTANCE_LIMITS.UPPER[mode]
        const lowerLimit = NON_TRANSIT_DISTANCE_LIMITS.LOWER[mode]

        if (pattern.distance > upperLimit || pattern.distance < lowerLimit) return
        return pattern
    }))

    return { foot, bicycle, car }
}
