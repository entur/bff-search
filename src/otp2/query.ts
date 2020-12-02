function minify(query: string): string {
    return query.trim().replace(/\s+/g, ' ')
}

export default minify(`
query (
    $numTripPatterns: Int,
    $from: Location!,
    $to: Location!,
    $dateTime: DateTime!,
    $arriveBy: Boolean!,
    $wheelchairAccessible: Boolean!,
    $modes: Modes!,
    $walkSpeed: Float,
    $minimumTransferTime: Int,
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
            wheelchairAccessible: $wheelchairAccessible,
            modes: $modes,
            walkSpeed: $walkSpeed,
            transferSlack: $minimumTransferTime,
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
                    generalizedCost
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
            generalizedCost
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
    advice {
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
    latitude
    longitude
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
    privateCode
}

fragment interchangeFields on Interchange {
    guaranteed
    staySeated
    FromServiceJourney {
        id
    }
    ToServiceJourney {
        id
    }
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
}
`)
