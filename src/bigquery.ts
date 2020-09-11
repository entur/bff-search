import { BigQuery } from '@google-cloud/bigquery'
import { parseJSON } from 'date-fns'

import { SearchParams } from './types'

import { sleep } from './utils/promise'
import logger from './logger'
import { ENVIRONMENT } from './config'

const projectId = ENVIRONMENT === 'prod' ? 'entur-prod' : ENVIRONMENT
const bigQuery = new BigQuery({ projectId })

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
    headers: { [key: string]: string },
): Promise<void> {
    const client = headers['ET-Client-Name'] || ''
    const table = getTableForClient(client)

    if (!table) return

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

        const query = `INSERT INTO \`${table}\` (
            fromName, fromPlace, toName, toPlace, searchDate, searchFilter,
            arriveBy, walkSpeed, minimumTransferTime, useFlex, createdAt
        ) VALUES (
            "${from.name}", "${from.place}", "${to.name}", "${
            to.place
        }", ${searchDateParsed},
            "${searchFilter.join()}", ${arriveBy}, ${walkSpeed}, ${minimumTransferTime}, ${useFlex},
            "${createdAt}"
        )`

        await queryWithRetries(query)
    } catch (error) {
        logger.error(`logTransitAnalytics: ${error.message}`, { client, error })
    }
}

function getTableForClient(client: string): string | undefined {
    if (ENVIRONMENT !== 'prod') return

    if (client.startsWith('entur-client-app')) {
        return 'entur-prod.analytics_app.transit_search'
    }

    if (client.startsWith('entur-client-web')) {
        return 'entur-prod.analytics_web.transit_search'
    }
}
