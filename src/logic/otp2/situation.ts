import { graphqlRequest } from '../../utils/graphqlRequest'

import { Affected, ExtraHeaders, SituationResponse } from '../../types'
import { TRANSIT_HOST_OTP2 } from '../../config'
import { uniqBy } from '../../utils/array'
import {
    SituationsFieldsNewFragment,
    SituationQueryVariables,
} from '../../generated/graphql'

import SITUATIONS_QUERY from './queries/situation.query'

export async function getSituation(
    situationNumber: string,
    extraHeaders: ExtraHeaders,
): Promise<SituationResponse | undefined> {
    const data = await graphqlRequest<
        { situation?: SituationsFieldsNewFragment },
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

    if (!data || !data.situation || !data.situation.reportType) return

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
        affects: uniqueAffected(affects.map(mapAffected)),
    }
}

type ResponseAffected = SituationsFieldsNewFragment['affects'][0]

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
    if ('stopPlace' in affected && affected.stopPlace) {
        return { __type: 'AffectedStopPlace', stopPlace: affected.stopPlace }
    }
    if ('quay' in affected && affected.quay) {
        return { __type: 'AffectedQuay', quay: affected.quay }
    }
    return { __type: 'AffectedUnknown' }
}

function uniqueAffected(affects: Affected[]): Affected[] {
    return uniqBy(affects, (affected) => {
        switch (affected.__type) {
            case 'AffectedStopPlace':
                return affected.stopPlace.id
            case 'AffectedLine':
                return affected.line.id
            case 'AffectedQuay':
                return affected.quay.name
            case 'AffectedServiceJourney':
                return affected.serviceJourney.id
            case 'AffectedUnknown':
                return 'AffectedUnknown'
        }
    })
}
