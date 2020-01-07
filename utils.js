const constants = require('./constants')
const { LEG_MODE } = constants

exports.isTransitAlternative = function isTransitAlternative({ legs }) {
    return (legs || []).some(isTransitLeg)
}

exports.isBikeRentalAlternative = function isBikeRentalAlternative({ legs }) {
    return (legs || []).some(isBikeRentalLeg)
}

exports.isFlexibleAlternative =  function isFlexibleAlternative({ legs }) {
    return (legs || []).some(isFlexibleLeg)
}

exports.isFlexibleTripsInCombination =  function isFlexibleTripsInCombination({ legs }) {
    if (!legs.some(isFlexibleLeg)) return true

    const transitLegs = legs.filter(isTransit)

    return transitLegs.length === 1 && isFlexibleLeg(transitLegs[0])
}

exports.parseTripPattern = function parseTripPattern(rawTripPattern) {
    return {
        ...rawTripPattern,
        legs: rawTripPattern.legs.map(parseLeg),
        genId: `${new Date().getTime()}:${Math.random().toString(36).slice(2, 12)}`,
    }
}

function parseLeg(leg) {
    const { fromPlace, fromEstimatedCall } = leg
    const fromQuay = fromPlace.quay

    if (!isFlexibleLeg(leg) && (fromQuay && fromQuay.name || fromEstimatedCall && fromEstimatedCall.quay.name)) {
        return {
            ...leg,
            fromPlace: {
                ...fromPlace,
                name: isTransitLeg(leg) ? fromQuay && fromQuay.name || fromEstimatedCall && fromEstimatedCall.quay.name : fromPlace.name,
            },
        }
    }
    return leg
}

function isFlexibleLeg({ line }) {
    return line && line.flexibleLineType === 'flexibleAreasOnly'
}

function isTransitLeg(leg) {
    return !isFoot(leg) && !isBicycle(leg) && !isCar(leg)
}

function isBikeRentalLeg(leg) {
    return Boolean(leg.fromPlace && leg.fromPlace.bikeRentalStation && leg.toPlace && leg.toPlace.bikeRentalStation)
}

function isFoot({ mode }) {
    return mode === LEG_MODE.FOOT
}

function isBicycle({ mode }) {
    return mode === LEG_MODE.BICYCLE
}

function isCar({ mode }) {
    return mode === LEG_MODE.CAR
}
