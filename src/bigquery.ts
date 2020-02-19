import { BigQuery } from '@google-cloud/bigquery'
import { parseJSON } from 'date-fns'

import { SearchParams } from '../types'

import logger from './logger'

const ENV = process.env.ENVIRONMENT
const projectId = ENV === 'prod' ? 'entur-prod' : ENV
const bigQuery = new BigQuery({ projectId })

export function logTransitAnalytics(params: SearchParams, headers: { [key: string]: string }): void {
    const client = headers['ET-Client-Name'] || ''
    const table = getTableForClient(client)
    const errorMessage = `Failed storing analytics for transit search from: <${client}>`

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
        const searchDateParsed = searchDate ? `"${parseJSON(searchDate).toISOString()}"` : ''
        const query = `INSERT INTO \`${table}\` (
            fromName, fromPlace, toName, toPlace, searchDate, searchFilter,
            arriveBy, walkSpeed, minimumTransferTime, useFlex
        ) VALUES (
            "${from.name}", "${from.place}", "${to.name}", "${to.place}", ${searchDateParsed},
            "${searchFilter.join()}", ${arriveBy}, ${walkSpeed}, ${minimumTransferTime}, ${useFlex}
        )`
        bigQuery.query({ query, useLegacySql: false }).catch(error => {
            logger.error(errorMessage, { client, error })
        })
    } catch (error) {
        logger.error(errorMessage, { client, error })
    }
}

function getTableForClient(client: string): string | undefined {
    if (ENV !== 'prod') return
    if (client.startsWith('entur-client-app')) return 'entur-prod.analytics_app.transit_search'
    if (client.startsWith('entur-client-web')) return 'entur-prod.analytics_web.transit_search'
}
