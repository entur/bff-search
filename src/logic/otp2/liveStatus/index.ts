import { getI18n, Locale } from '../../../utils/locale'
import { get as cacheGet, set as cacheSet } from '../../../cache'

import { createLiveStatus, filterRealtimeData } from './helpers'
import createEnturService from '@entur/sdk'
import { TRANSIT_HOST_OTP2 } from '../../../config'
import { EstimatedCall, Status } from './types'

export { equalStatus } from './helpers'

export type { Status } from './types'

import SERVICE_JOURNEY_QUERY from './query'

const sdk = createEnturService({
    clientName: 'entur-search',
    hosts: {
        journeyPlanner: TRANSIT_HOST_OTP2,
    },
})

export async function getLiveStatus(
    serviceJourneyId: string,
    date: string,
    locale?: Locale,
): Promise<Status | undefined> {
    const i18n = getI18n(locale || Locale.BOKMAL)

    const cacheKey = `live-status_${serviceJourneyId}_${date}`

    const cachedCalls = await cacheGet<EstimatedCall[]>(cacheKey, -1)
    if (cachedCalls) {
        return createLiveStatus(cachedCalls, i18n)
    }

    const calls = await getCallsForServiceJourney(serviceJourneyId, date)
    const updatedCalls = filterRealtimeData(calls)
    await cacheSet(cacheKey, updatedCalls, 10)

    return createLiveStatus(updatedCalls, i18n)
}

async function getCallsForServiceJourney(
    id: string,
    date: string,
): Promise<EstimatedCall[]> {
    interface ServiceJourneyResponse {
        serviceJourney?: {
            estimatedCalls?: EstimatedCall[]
        }
    }

    const data = await sdk.queryJourneyPlanner<ServiceJourneyResponse>(
        SERVICE_JOURNEY_QUERY,
        {
            id,
            date,
        },
    )

    if (!data || !data.serviceJourney || !data.serviceJourney.estimatedCalls) {
        return Promise.reject('No service journey found')
    }

    return data.serviceJourney.estimatedCalls
}
