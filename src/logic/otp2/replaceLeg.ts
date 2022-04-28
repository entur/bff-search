import createEnturService from '@entur/sdk'

import { TRANSIT_HOST_OTP2 } from '../../config'
import { Leg } from '../../types'
interface ReplaceLeg {
    leg?: Leg
}

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: TRANSIT_HOST_OTP2,
    },
})

export async function getAlternativeLegs(
    id: string,
    numberOfNext: number,
    numberOfPrevious: number,
): Promise<ReplaceLeg> {
    const query = `
        query($id:ID!, $numberOfNext: Int, $numberOfPrevious: Int) {      
            leg(id:$id) {
                id
                aimedStartTime
                nextLegs(next: $numberOfNext) {
                    ...replaceLegFields
                }
                previousLegs(previous: $numberOfPrevious) {
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

    const data = await sdk
        .queryJourneyPlanner<ReplaceLeg>(query, {
            id,
            numberOfNext,
            numberOfPrevious,
        })
        .catch((e) => {
            console.log(e)
        })

    if (!data || !data.leg) {
        return Promise.reject('No alternative legs found')
    }

    return data
}
