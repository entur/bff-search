import { gql } from 'graphql-request'
import {
    authorityFields,
    bikeRentalStationFields,
    bookingArrangementFields,
    estimatedCallFields,
    interchangeFields,
    legFields,
    lineFields,
    noticeFields,
    operatorFields,
    placeFields,
    pointsOnLinkFields,
    quayFields,
    replaceLegFields,
    serviceJourneyFields,
    situationsFields,
    stopPlaceFields,
} from './fragments'

export default gql`
    query getTripPatterns(
        $numTripPatterns: Int
        $from: Location!
        $to: Location!
        $dateTime: DateTime!
        $arriveBy: Boolean!
        $wheelchairAccessible: Boolean!
        $modes: Modes!
        $walkSpeed: Float
        $transferSlack: Int
        $transferPenalty: Int
        $banned: InputBanned
        $whiteListed: InputWhiteListed
        $debugItineraryFilter: Boolean
        $searchWindow: Int
        $walkReluctance: Float
        $waitReluctance: Float
    ) {
        trip(
            numTripPatterns: $numTripPatterns
            from: $from
            to: $to
            dateTime: $dateTime
            arriveBy: $arriveBy
            wheelchairAccessible: $wheelchairAccessible
            modes: $modes
            walkSpeed: $walkSpeed
            transferSlack: $transferSlack
            transferPenalty: $transferPenalty
            banned: $banned
            whiteListed: $whiteListed
            debugItineraryFilter: $debugItineraryFilter
            searchWindow: $searchWindow
            walkReluctance: $walkReluctance
            waitReluctance: $waitReluctance
        ) {
            metadata {
                searchWindowUsed
                nextDateTime
                prevDateTime
            }
            routingErrors {
                inputField
                description
                code
            }
            tripPatterns {
                generalizedCost
                startTime
                endTime
                expectedStartTime
                expectedEndTime
                directDuration
                duration
                distance
                walkDistance
                systemNotices {
                    tag
                    text
                }
                legs {
                    generalizedCost
                    ...legFields
                }
            }
        }
    }
    ${legFields}
    ${replaceLegFields}
    ${bookingArrangementFields}
    ${lineFields}
    ${noticeFields}
    ${placeFields}
    ${quayFields}
    ${situationsFields}
    ${stopPlaceFields}
    ${bikeRentalStationFields}
    ${authorityFields}
    ${operatorFields}
    ${serviceJourneyFields}
    ${interchangeFields}
    ${pointsOnLinkFields}
    ${estimatedCallFields}
`
