import { GraphqlQuery } from '../../types'

import { buildShamashLink } from '../../utils/graphql'
import { ENVIRONMENT } from '../../config'

export function generateShamashLink({
    query,
    variables,
}: GraphqlQuery): string {
    const host =
        ENVIRONMENT === 'prod' || ENVIRONMENT === 'beta'
            ? 'https://api.entur.io/journey-planner/v2/ide/'
            : `https://api.${ENVIRONMENT}.entur.io/journey-planner/v2/ide/`

    return buildShamashLink(host, query, variables)
}
