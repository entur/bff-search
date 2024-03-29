import { gql } from 'graphql-request'
import { replaceLegFields } from './fragments'

export default gql`
    query replaceLeg($id: ID!, $numberOfNext: Int!, $numberOfPrevious: Int!) {
        leg(id: $id) {
            id
            aimedStartTime
            nextLegs(next: $numberOfNext, filter: sameMode) {
                ...replaceLegFields
            }
            previousLegs(previous: $numberOfPrevious, filter: sameMode) {
                ...replaceLegFields
            }
        }
    }
    ${replaceLegFields}
`
