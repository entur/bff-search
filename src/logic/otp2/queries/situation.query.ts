import { gql } from 'graphql-request'
import { situationsFieldsNew } from './fragments'

export default gql`
    query situation($situationNumber: String!) {
        situation(situationNumber: $situationNumber) {
            ...situationsFieldsNew
        }
    }
    ${situationsFieldsNew}
`
