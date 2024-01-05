import { Variables, rawRequest } from 'graphql-request'
import logger from '../logger'

let lastLoggedTimestamp = 0
const logInterval = 60 * 1000 * 2

export const graphqlRequest = async <T = any, V extends Variables = Variables>(
    url: string,
    query: any,
    variables: V,
    extraHeaders: Record<string, string>,
    comment: string,
): Promise<T> => {
    const currentTimestamp = Date.now()

    const { data, headers } = await rawRequest<T>(
        url,
        query,
        variables,
        extraHeaders,
    )

    if (currentTimestamp - lastLoggedTimestamp > logInterval) {
        const rateLimitHeaders = {
            comment,
            clientName: extraHeaders['entur-pos'],
            rateLimitAllowed: headers.get('rate-limit-allowed'),
            rateLimitUsed: headers.get('rate-limit-used'),
            rateLimitAvailable: headers.get('rate-limit-available'),
            rateLimitRange: headers.get('rate-limit-range'),
        }

        lastLoggedTimestamp = currentTimestamp
        if (process.env.NODE_ENV === 'production') {
            logger.log('info', 'OTP Rate limit', rateLimitHeaders)
        }
    }

    return data
}
