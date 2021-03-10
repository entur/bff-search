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
        logger.debug(`Query successful. Retries done: ${retriesDone}`)
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

export function buildInsertQuery(
    table: string,
    data: Record<string, string | number | boolean | undefined>,
): string {
    const keys = Object.keys(data).join(', ').trim()
    const values = Object.values(data)
        .map((value) => JSON.stringify(value ?? null))
        .join(', ')
        .trim()

    if (keys.length === 0) {
        throw new Error(
            'buildInsertQuery was called with an empty data argument',
        )
    }

    return `INSERT INTO \`${table}\` (${keys}) VALUES (${values})`
}

export async function logTransitAnalytics(
    params: SearchParams,
    useOtp2: boolean,
    clientName: string,
): Promise<void> {
    const table = `entur-${ENVIRONMENT}.analytics.transit_search`
    let query: string | undefined

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
            ? parseJSON(searchDate).toISOString()
            : ''
        const createdAt = new Date().toISOString()

        const platform = getPlatform(clientName)

        query = buildInsertQuery(table, {
            fromName: from.name,
            fromPlace: from.place,
            toName: to.name,
            toPlace: to.place,
            searchDate: searchDateParsed,
            searchFilter: searchFilter.join(),
            arriveBy,
            walkSpeed,
            minimumTransferTime,
            useFlex,
            useOtp2,
            platform,
            createdAt,
        })

        await queryWithRetries(query)
        logger.debug('logTransitAnalytics success', { client: clientName })
    } catch (error) {
        logger.error(`logTransitAnalytics: ${error.message}`, {
            client: clientName,
            query,
            error,
        })
    }
}

export async function logTransitResultStats(
    numberOfOperators: number,
    clientName: string,
): Promise<void> {
    const table = `entur-${ENVIRONMENT}.analytics.transit_result_stats`

    try {
        const now = new Date().toISOString()
        const platform = getPlatform(clientName)

        const query = buildInsertQuery(table, {
            createdAt: now,
            platform,
            numberOfOperators,
        })

        await queryWithRetries(query)
        logger.debug('logTransitResultStats success', { client: clientName })
    } catch (error) {
        logger.error(`logTransitResultStats: ${error.message}`, {
            client: clientName,
            error,
        })
    }
}
