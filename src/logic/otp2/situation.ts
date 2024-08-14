import { graphqlRequest } from '../../utils/graphqlRequest'

import { Affected, ExtraHeaders, SituationResponse } from '../../types'
import { TRANSIT_HOST_OTP2 } from '../../config'
import { uniqBy } from '../../utils/array'
import {
    MultilingualString,
    SituationQuery,
    SituationQueryVariables,
} from '../../generated/graphql'

import SITUATIONS_QUERY from './queries/situation.query'

export async function getSituation(
    situationNumber: string,
    extraHeaders: ExtraHeaders,
): Promise<SituationResponse | undefined> {
    const data = await graphqlRequest<SituationQuery, SituationQueryVariables>(
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
        summary: defaultMultilingualString(summary),
        description: defaultMultilingualString(description),
        advice: defaultMultilingualString(advice),
        validityPeriod: validityPeriod || undefined,
        infoLinks: infoLinks || undefined,
        affects: uniqBy(affects.map(mapAffected), getIdForAffected),
    }
}

function defaultMultilingualString(
    multilingualStrings: MultilingualString[],
): MultilingualString[] {
    if (multilingualStrings.length > 1) return multilingualStrings

    return multilingualStrings.map((multilingualString) => {
        return multilingualString.language === null
            ? { ...multilingualString, language: 'nor' }
            : multilingualString
    })
}

type ResponseAffected = NonNullable<SituationQuery['situation']>['affects'][0]

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

function getIdForAffected(affected: Affected): string {
    switch (affected.__type) {
        case 'AffectedStopPlace':
            return affected.stopPlace.id
        case 'AffectedLine':
            return affected.line.id
        case 'AffectedQuay':
            return affected.quay.id
        case 'AffectedServiceJourney':
            return affected.serviceJourney.id
        case 'AffectedUnknown':
            return 'AffectedUnknown'
    }
}
