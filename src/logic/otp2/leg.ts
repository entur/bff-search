import { request as graphqlRequest } from 'graphql-request'

import { TRANSIT_HOST_OTP2 } from '../../config'
import { Leg, ExtraHeaders } from '../../types'
import GET_LEG_QUERY from './queries/getLeg.query'
import { GetLegQuery, GetLegQueryVariables } from '../../generated/graphql'

export async function getLeg(
    id: string,
    extraHeaders: ExtraHeaders,
): Promise<Leg> {
    const { leg } = await graphqlRequest<GetLegQuery, GetLegQueryVariables>(
        `${TRANSIT_HOST_OTP2}/graphql`,
        GET_LEG_QUERY,
        {
            id,
        },
        extraHeaders,
    )
    if (!leg) {
        return Promise.reject('No leg found')
    }
    return leg
}
