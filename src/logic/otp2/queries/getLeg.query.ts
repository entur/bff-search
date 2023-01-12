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
    query getLeg($id: ID!) {
        leg(id: $id) {
            ...legFields
        }
    }
    ${legFields}
    ${bookingArrangementFields}
    ${lineFields}
    ${replaceLegFields}
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
