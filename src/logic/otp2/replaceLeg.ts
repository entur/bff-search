import { graphqlRequest } from '../../utils/graphqlRequest'
import { TRANSIT_HOST_OTP2 } from '../../config'
import { ExtraHeaders } from '../../types'
import REPLACE_LEG_QUERY from './queries/replaceLeg.query'
import {
    ReplaceLegQuery,
    ReplaceLegQueryVariables,
} from '../../generated/graphql'

export async function getAlternativeLegs(
    variables: ReplaceLegQueryVariables,
    extraHeaders: ExtraHeaders,
): Promise<ReplaceLegQuery> {
    try {
        return graphqlRequest<ReplaceLegQuery, ReplaceLegQueryVariables>(
            `${TRANSIT_HOST_OTP2}/graphql`,
            REPLACE_LEG_QUERY,
            variables,
            extraHeaders,
        )
    } catch (error) {
        return error
    }
}
