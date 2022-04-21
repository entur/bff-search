import createEnturService from '@entur/sdk'

import { TRANSIT_HOST_OTP2 } from '../../config'
import logger from '../../logger'

import { Leg } from '../../types'

interface LegResponse {
    leg: Leg[]
}

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: TRANSIT_HOST_OTP2,
    },
})

export async function getAlternativeLegs(
    id: string,
    previous: number,
    next: number,
): Promise<LegResponse[]> {
    const query = `
            leg(id:$id) {
                id 
                aimedStartTime
            }
        `.trim()

    const data = await sdk.queryJourneyPlanner<LegResponse>(query, {
        id,
    })

    if (!data) {
        return Promise.reject('No alternative legs found')
    }

    return []
}
