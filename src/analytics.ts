import { PostHog } from 'posthog-node'
import cleanDeep from 'clean-deep'
import { getSecret } from './secrets'
import logger from './logger'
import { getPostHogId, getSessionId } from './utils/withCorrelationIds'

let client: PostHog | undefined

export enum Events {
    InitialTravelSearch = 'INITIAL_TRAVEL_SEARCH',
}

export function logEvent(
    event: Events,
    platform: 'APP' | 'WEB',
    metadata?: Record<string, any>,
): void {
    const distinctId = getPostHogId() || getSessionId()
    if (!distinctId) return

    client?.capture({
        event: `BFF_SEARCH_${event}`,
        distinctId,
        properties: { platform, ...cleanDeep(metadata) },
    })
}

if (process.env.NODE_ENV === 'production') {
    getSecret('posthog-token')
        .then((token) => {
            client = new PostHog(token, {
                host: 'https://eu.posthog.com',
                disableGeoip: true,
            })
            return
        })
        .catch((err) => {
            logger.warning(err)
        })

    process.on('exit', () => client?.shutdown())
}
