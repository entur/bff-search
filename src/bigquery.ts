import { BigQuery } from '@google-cloud/bigquery'
import { parseJSON } from 'date-fns'
import { SearchParams, Platform } from './types'
import { sleep } from './utils/promise'
import logger from './logger'
import { ENVIRONMENT } from './config'

const projectId = `entur-${ENVIRONMENT}`
const bigQuery = new BigQuery({ projectId })

function getPlatform(client: string): Platform | undefined {
    if (client.startsWith('entur-client-app')) return Platform.APP
    if (client.startsWith('entur-client-web')) return Platform.WEB
    if (client.startsWith('entur-client-widget')) return Platform.WIDGET
}

const MAX_RETRIES = 5

async function queryWithRetries(query: string, retriesDone = 0): Promise<void> {
    try {
        await bigQuery.query({ query, useLegacySql: false })
        logger.debug(
            `logTransitAnalytics success, retries done: ${retriesDone}`,
        )
    } catch (error) {
        if (
            error.message.includes('Exceeded rate limits') &&
            retriesDone < MAX_RETRIES
        ) {
            const retryNumber = retriesDone + 1
            const minDelay = 100 * retryNumber
            const sleepDuration =
                minDelay + 2 ** retryNumber * 1000 * Math.random()
            await sleep(sleepDuration)
            return queryWithRetries(query, retryNumber)
        }
        throw error
    }
}

export async function logTransitAnalytics(
    params: SearchParams,
    useOtp2: boolean,
    headers: { [key: string]: string },
): Promise<void> {
    const table = `entur-${ENVIRONMENT}.analytics.transit_search`
    const client = headers['ET-Client-Name'] || ''
    try {
        const {
            from,
            to,
            searchDate,
            searchFilter = [],
            arriveBy = false,
            walkSpeed,
            minimumTransferTime,
            useFlex = false,
        } = params

        const searchDateParsed = searchDate
            ? `"${parseJSON(searchDate).toISOString()}"`
            : ''
        const createdAt = new Date().toISOString()

        const platform = getPlatform(client)

        const query = `INSERT INTO \`${table}\` (
            fromName, fromPlace, toName, toPlace, searchDate, searchFilter,
            arriveBy, walkSpeed, minimumTransferTime, useFlex, useOtp2, platform, createdAt
        ) VALUES (
            "${from.name}", "${from.place}", "${to.name}", "${
            to.place
        }", ${searchDateParsed},
            "${searchFilter.join()}", ${arriveBy}, ${walkSpeed}, ${minimumTransferTime}, ${useFlex}, ${useOtp2}, "${platform}",
            "${createdAt}"
        )`

        await queryWithRetries(query)
        logger.debug('logTransitAnalytics success', { client })
    } catch (error) {
        logger.error(`logTransitAnalytics: ${error.message}`, { client, error })
    }
}
