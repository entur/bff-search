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
    serviceJourneyFields,
    situationsFields,
    stopPlaceFields,
} from './fragments'

export default gql`
    query getLeg($id: ID!) {
        leg(id: $id) {
            generalizedCost
            ...legFields
        }
    }
    ${legFields}
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
