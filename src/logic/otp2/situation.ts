import { graphqlRequest } from '../../utils/graphqlRequest'

import { Affected, ExtraHeaders, SituationResponse } from '../../types'
import { TRANSIT_HOST_OTP2 } from '../../config'
import SITUATIONS_QUERY from './queries/situation.query'
import {
    SituationFieldsNewFragment,
    SituationQueryVariables,
} from '../../generated/graphql'

export async function getSituation(
    situationNumber: string,
    extraHeaders: ExtraHeaders,
): Promise<SituationResponse | undefined> {
    const data = await graphqlRequest<
        { situation: SituationFieldsNewFragment },
        SituationQueryVariables
    >(
        `${TRANSIT_HOST_OTP2}/graphql`,
        SITUATIONS_QUERY,
        {
            situationNumber,
        },
        extraHeaders,
        'getSituation',
    )

    if (!data) return

    const {
        reportType,
        summary,
        description,
        advice,
        validityPeriod,
        infoLinks,
        affects,
    } = data.situation

    if (!reportType) return
    return {
        situationNumber,
        reportType,
        summary,
        description,
        advice,
        validityPeriod: validityPeriod || undefined,
        infoLinks: infoLinks || undefined,
        affects: affects.map(mapAffected),
    }
}

type ResponseAffected = SituationFieldsNewFragment['affects'][0]

function mapAffected(affected: ResponseAffected): Affected {
    if ('line' in affected && affected.line) {
        return { __type: 'AffectedLine', line: affected.line }
    }
    if ('serviceJourney' in affected && affected.serviceJourney) {
        return {
            __type: 'AffectedServiceJourney',
            serviceJourney: affected.serviceJourney,
        }
    }
    if ('quay' in affected && affected.quay) {
        return { __type: 'AffectedQuay', quay: affected.quay }
    }
    if ('stopPlace' in affected && affected.stopPlace) {
        return { __type: 'AffectedStopPlace', stopPlace: affected.stopPlace }
    }
    return { __type: 'AffectedUnknown' }
}
