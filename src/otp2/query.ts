export default `
query (
    $numTripPatterns: Int!,
    $from: Location!,
    $to: Location!,
    $dateTime: DateTime!,
    $arriveBy: Boolean!,
    $wheelchair: Boolean!,
    $modes: Modes!,
    $transportSubmodes: [TransportSubmodeFilter],
    $maxPreTransitWalkDistance: Float,
    $walkSpeed: Float,
    $minimumTransferTime: Int,
    $allowBikeRental: Boolean,
    $useFlex: Boolean,
    $banned: InputBanned,
    $whiteListed: InputWhiteListed,
    $debugItineraryFilter: Boolean,
    ) {
        trip(
            numTripPatterns: $numTripPatterns,
            from: $from,
            to: $to,
            dateTime: $dateTime,
            arriveBy: $arriveBy,
            wheelchair: $wheelchair,
            modes: $modes,
            transportSubmodes: $transportSubmodes,
            maxPreTransitWalkDistance: $maxPreTransitWalkDistance,
            walkSpeed: $walkSpeed,
            minimumTransferTime: $minimumTransferTime,
            allowBikeRental: $allowBikeRental,
            useFlex: $useFlex,
            banned: $banned,
            whiteListed: $whiteListed,
            debugItineraryFilter: $debugItineraryFilter
            ) {
                metadata {
                    searchWindowUsed
                    nextDateTime
                    prevDateTime
                }
                tripPatterns {
                    startTime
        endTime
        directDuration
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

  fragment legFields on Leg {
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
    operator {
        ...operatorFields
    }
    pointsOnLink {
        ...pointsOnLinkFields
    }
    realtime
    ride
    rentedBike
    serviceJourney {
        ...serviceJourneyFields
    }
    situations {
        ...situationFields
    }
    toEstimatedCall {
      ...estimatedCallFields
    }
    toPlace {
      ...placeFields
    }
    transportSubmode
  }

  fragment lineFields on Line {
      bookingArrangements {
          ...bookingArrangementFields
        }
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

    fragment bookingArrangementFields on BookingArrangement {
        bookingMethods
        bookingNote
        minimumBookingPeriod
        bookingContact {
            phone
            url
        }
    }

    fragment noticeFields on Notice {
        text
    }

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

fragment quayFields on Quay {
    id
    name
    description
    publicCode
    situations {
        ...situationFields
    }
    stopPlace {
        ...stopPlaceFields
    }
}

fragment situationFields on PtSituationElement {
    situationNumber
    summary {
        language
        value
    }
    description {
        language
        value
    }
    detail {
        language
        value
    }
    lines {
        ...lineFields
    }
    validityPeriod {
        startTime
        endTime
    }
    reportType
    infoLinks {
        uri
        label
    }
}

fragment stopPlaceFields on StopPlace {
    id
    description
    name
    tariffZones {
        id
    }
}

fragment bikeRentalStationFields on BikeRentalStation {
    id
    name
    networks
    bikesAvailable
    spacesAvailable
    longitude
    latitude
}

fragment authorityFields on Authority {
    id
    name
    url
}

fragment operatorFields on Operator {
    id
    name
    url
}

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
    transportSubmode
}

fragment interchangeFields on Interchange {
    guaranteed
    staySeated
}

fragment pointsOnLinkFields on PointsOnLink {
    points
    length
}

fragment estimatedCallFields on EstimatedCall {
    actualArrivalTime
    actualDepartureTime
    aimedArrivalTime
    aimedDepartureTime
    cancellation
    date
    destinationDisplay {
        frontText
    }
    expectedDepartureTime
    expectedArrivalTime
    forAlighting
    forBoarding
    notices {
        ...noticeFields
    }
    quay {
        ...quayFields
    }
    realtime
    requestStop
    serviceJourney {
        ...serviceJourneyFields
    }
    situations {
        ...situationFields
    }
}
`