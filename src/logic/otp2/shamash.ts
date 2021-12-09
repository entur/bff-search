import { GraphqlQuery } from '../../types'

import { buildShamashLink } from '../../utils/graphql'
import { ENVIRONMENT } from '../../config'

export function generateShamashLink({
    query,
    variables,
}: GraphqlQuery): string {
    const host =
        ENVIRONMENT === 'prod' || ENVIRONMENT === 'beta'
            ? 'https://api.entur.io/graphql-explorer/journey-planner-v3'
            : `https://api.${ENVIRONMENT}.entur.io/graphql-explorer/journey-planner-v3`

    return buildShamashLink(host, query, variables)
}
