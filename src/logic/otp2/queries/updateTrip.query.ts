import { gql } from 'graphql-request'
import { updatedEstimatedCallFields } from './fragments'

export default gql`
    query updateTrip($id: String!, $date: Date!) {
        serviceJourney(id: $id) {
            estimatedCalls(date: $date) {
                ...updatedEstimatedCallFields
            }
        }
    }
    ${updatedEstimatedCallFields}
`
