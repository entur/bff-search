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
    situationRefFields,
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
        $debugItineraryFilter: ItineraryFilterDebugProfile
        $searchWindow: Int
        $walkReluctance: Float
        $waitReluctance: Float
        $pageCursor: String
        $passThroughPoints: [PassThroughPoint!]
        $relaxTransitGroupPriority: RelaxCostInput
        $includeCancellations: Boolean
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
            itineraryFilters: { debug: $debugItineraryFilter }
            searchWindow: $searchWindow
            walkReluctance: $walkReluctance
            waitReluctance: $waitReluctance
            pageCursor: $pageCursor
            passThroughPoints: $passThroughPoints
            relaxTransitGroupPriority: $relaxTransitGroupPriority
            includePlannedCancellations: $includeCancellations
            includeRealtimeCancellations: $includeCancellations
        ) {
            metadata {
                searchWindowUsed
            }
            nextPageCursor
            previousPageCursor
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
                duration
                distance
                walkDistance
                systemNotices {
                    tag
                    text
                }
                legs {
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
    ${situationRefFields}
    ${stopPlaceFields}
    ${bikeRentalStationFields}
    ${authorityFields}
    ${operatorFields}
    ${serviceJourneyFields}
    ${interchangeFields}
    ${pointsOnLinkFields}
    ${estimatedCallFields}
`
