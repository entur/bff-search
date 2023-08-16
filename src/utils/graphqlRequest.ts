import { Variables, rawRequest } from 'graphql-request'
import { set as cacheSet, get as cacheGet } from '../cache'
import logger from '../logger'

export const graphqlRequest = async <T = any, V = Variables>(
    url: string,
    query: any,
    variables: any,
    extraHeaders: Record<string, string>,
): Promise<T> => {
    const { data, headers } = await rawRequest<T, V>(
        url,
        query,
        variables,
        extraHeaders,
    )

    const rateLimitHeaders = {
        url,
        rateLimitAllowed: headers.get('rate-limit-allowed'),
        rateLimitUsed: headers.get('rate-limit-used'),
        rateLimitAvailable: headers.get('rate-limit-available'),
        rateLimitRange: headers.get('rate-limit-range'),
    }

    const otpRateLimitCache = await cacheGet('otp-rate-limit')
    if (!otpRateLimitCache) {
        await cacheSet('otp-rate-limit', rateLimitHeaders, 60)
        logger.log('info', 'OTP Rate limit info', rateLimitHeaders)
    }

    return data
}

// if (process.env.NODE_ENV === 'production') {
//
