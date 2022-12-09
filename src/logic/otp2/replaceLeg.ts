import { request as graphqlRequest } from 'graphql-request'

import { TRANSIT_HOST_OTP2 } from '../../config'
import { Leg, ExtraHeaders } from '../../types'
interface ReplaceLeg {
    leg?: Leg
}

interface AlternativeLegsVariables {
    id: string
    numberOfNext: number
    numberOfPrevious: number
}

export async function getAlternativeLegs(
    variables: AlternativeLegsVariables,
    extraHeaders: ExtraHeaders,
): Promise<ReplaceLeg> {
    const query = `
        query($id:ID!, $numberOfNext: Int, $numberOfPrevious: Int) {      
            leg(id:$id) {
                id
                aimedStartTime
                nextLegs(next: $numberOfNext, filter: sameAuthority) {
                    ...replaceLegFields
                }
                previousLegs(previous: $numberOfPrevious, filter: sameAuthority) {
                    ...replaceLegFields
                }
            }              
        }
        
        fragment replaceLegFields on Leg {
            id
            mode
            transportSubmode
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
            fromPlace {
              name
            }
          }            
        `.trim()

    try {
        return graphqlRequest(
            `${TRANSIT_HOST_OTP2}/graphql`,
            query,
            variables,
            extraHeaders,
        )
    } catch (error) {
        return error
    }
}
