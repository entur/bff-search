import { Variables, rawRequest } from 'graphql-request'
import logger from '../logger'

let lastLoggedTimestamp = 0

export const graphqlRequest = async <T = any, V = Variables>(
    url: string,
    query: any,
    variables: any,
    extraHeaders: Record<string, string>,
): Promise<T> => {
    const currentTimestamp = Date.now()

    const { data, headers } = await rawRequest<T, V>(
        url,
        query,
        variables,
        extraHeaders,
    )
    const rateLimitHeaders = {
        rateLimitAllowed: headers.get('rate-limit-allowed'),
        rateLimitUsed: headers.get('rate-limit-used'),
        rateLimitAvailable: headers.get('rate-limit-available'),
        rateLimitRange: headers.get('rate-limit-range'),
    }

    if (currentTimestamp - lastLoggedTimestamp > 60000) {
        lastLoggedTimestamp = currentTimestamp
        if (process.env.NODE_ENV === 'production') {
            logger.log('info', 'OTP Rate limit', rateLimitHeaders)
        }
    }

    return data
}
