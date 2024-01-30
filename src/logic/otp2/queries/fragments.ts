import { gql } from 'graphql-request'

export const legFields = gql`
    fragment legFields on Leg {
        generalizedCost
        aimedEndTime
        aimedStartTime
        authority {
            ...authorityFields
        }
        distance
        directDuration
        duration
        expectedEndTime
        expectedStartTime
        fromEstimatedCall {
            ...estimatedCallFields
        }
        fromPlace {
            ...placeFields
        }
        id
        interchangeFrom {
            ...interchangeFields
        }
        interchangeTo {
            ...interchangeFields
        }
        intermediateEstimatedCalls {
            ...estimatedCallFields
        }
        line {
            ...lineFields
        }
        mode
        nextLegs {
            ...replaceLegFields
        }
        operator {
            ...operatorFields
        }
        pointsOnLink {
            ...pointsOnLinkFields
        }
        previousLegs {
            ...replaceLegFields
        }
        realtime
        ride
        rentedBike
        serviceDate
        serviceJourney {
            ...serviceJourneyFields
        }
        situations {
            ...situationRefFields
        }
        toEstimatedCall {
            ...estimatedCallFields
        }
        toPlace {
            ...placeFields
        }
        transportSubmode

        bookingArrangements {
            ...bookingArrangementFields
        }
    }
`

export const replaceLegFields = gql`
    fragment replaceLegFields on Leg {
        id
        mode
        transportSubmode
        aimedStartTime
        expectedStartTime
        fromEstimatedCall {
            actualDepartureTime
        }
        line {
            publicCode
        }
        toPlace {
            name
        }
        fromPlace {
            name
        }
    }
`

export const bookingArrangementFields = gql`
    fragment bookingArrangementFields on BookingArrangement {
        bookingMethods
        bookingNote
        latestBookingTime
        minimumBookingPeriod
        bookWhen
        bookingContact {
            phone
            url
        }
    }
`

export const lineFields = gql`
    fragment lineFields on Line {
        description
        flexibleLineType
        id
        name
        notices {
            ...noticeFields
        }
        publicCode
        transportMode
        transportSubmode
    }
`

export const noticeFields = gql`
    fragment noticeFields on Notice {
        text
    }
`

export const placeFields = gql`
    fragment placeFields on Place {
        name
        latitude
        longitude
        quay {
            ...quayFields
        }
        bikeRentalStation {
            ...bikeRentalStationFields
        }
    }
`

export const quayFields = gql`
    fragment quayFields on Quay {
        id
        name
        description
        publicCode
        situations {
            ...situationRefFields
        }
        stopPlace {
            ...stopPlaceFields
        }
    }
`

/* @deprecated
 * Will be removed from TripPattern, legs, serviceJourney etc.
 * Use new situation endpoint.
 */
export const situationRefFields = gql`
    fragment situationRefFields on PtSituationElement {
        situationNumber
        reportType
    }
`

export const stopPlaceFields = gql`
    fragment stopPlaceFields on StopPlace {
        id
        description
        name
        latitude
        longitude
        tariffZones {
            id
        }
    }
`

export const bikeRentalStationFields = gql`
    fragment bikeRentalStationFields on BikeRentalStation {
        id
        name
        networks
        bikesAvailable
        spacesAvailable
        longitude
        latitude
    }
`

export const authorityFields = gql`
    fragment authorityFields on Authority {
        id
        name
        url
    }
`

export const operatorFields = gql`
    fragment operatorFields on Operator {
        id
        name
        url
    }
`

export const serviceJourneyFields = gql`
    fragment serviceJourneyFields on ServiceJourney {
        id
        journeyPattern {
            line {
                ...lineFields
            }
            notices {
                ...noticeFields
            }
        }
        notices {
            ...noticeFields
        }
        publicCode
        privateCode
    }
`

export const interchangeFields = gql`
    fragment interchangeFields on Interchange {
        guaranteed
        staySeated
        maximumWaitTime
        fromServiceJourney {
            id
        }
        toServiceJourney {
            id
        }
    }
`

export const pointsOnLinkFields = gql`
    fragment pointsOnLinkFields on PointsOnLink {
        points
        length
    }
`

export const estimatedCallFields = gql`
    fragment estimatedCallFields on EstimatedCall {
        actualArrivalTime
        actualDepartureTime
        aimedArrivalTime
        aimedDepartureTime
        cancellation
        date
        destinationDisplay {
            frontText
            via
        }
        expectedDepartureTime
        expectedArrivalTime
        forAlighting
        forBoarding
        notices {
            ...noticeFields
        }
        predictionInaccurate
        quay {
            ...quayFields
        }
        realtime
        requestStop
        serviceJourney {
            ...serviceJourneyFields
        }
    }
`
