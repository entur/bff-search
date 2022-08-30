import { GraphqlQuery } from '../../types'

import { buildShamashLink } from '../../utils/graphql'
import { ENVIRONMENT } from '../../config'

export function generateShamashLink({
    query,
    variables,
}: GraphqlQuery): string {
    let host
    if (ENVIRONMENT === 'prod' || ENVIRONMENT === 'beta') {
        host = 'https://api.entur.io/graphql-explorer/journey-planner-v3'
    } else if (ENVIRONMENT === 'dev') {
        host = 'https://api.dev.entur.io/graphql-explorer/journey-planner-v3'
    } else {
        host = `https://api.${ENVIRONMENT}.entur.io/graphql-explorer/journey-planner-v3`
    }

    return buildShamashLink(host, query, variables)
}
