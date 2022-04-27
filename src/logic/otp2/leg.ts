import createEnturService from '@entur/sdk'

import { TRANSIT_HOST_OTP2 } from '../../config'
import { Leg } from '../../types'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: TRANSIT_HOST_OTP2,
    },
})

export async function getLeg(id: string): Promise<Leg> {
    const query = `
        query($id:ID!) {      
            leg(id:$id) {
                generalizedCost
                ...legFields
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
                id
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
                mode
                transportSubmode
            }
            operator {
                ...operatorFields
            }
            pointsOnLink {
                ...pointsOnLinkFields
            }
            previousLegs {
                id
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
                mode
                transportSubmode
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
    
            bookingArrangements {
                ...bookingArrangementFields
            }
        }
    
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
            maximumWaitTime
            fromServiceJourney {
                id
            }
            toServiceJourney {
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
        `.trim()

    // Legg til nødvendig Leg data
    const data = await sdk
        .queryJourneyPlanner<Leg>(query, {
            id,
        })
        .catch((e) => {
            console.log(e)
        })

    if (!data) {
        return Promise.reject('No leg found')
    }

    return data.leg
}
