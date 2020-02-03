import { BigQuery } from '@google-cloud/bigquery'

import { SearchParams } from '../types'

import logger from './logger'

const bigQuery = new BigQuery({ projectId: process.env.ENVIRONMENT })

export function logTransitAnalytics(params: SearchParams, headers: { [key: string]: string }): void {
    const client = headers['ET-Client-Name'] || ''
    const table = getTableForClient(client)

    if(!table) return

    try {
        const {
            from, to, searchDate, searchFilter = [], arriveBy, maxPreTransitWalkDistance,
            walkSpeed, minimumTransferTime, useFlex,
        } = params
        const query = `INSERT INTO \`${table}\`
        (fromName, fromPlace, toName, toPlace, searchDate, searchFilter, arriveBy)
        VALUES ("${from.name}", "${from.place}", "${to.name}", "${to.place}", "${searchDate}", "${searchFilter.join()}",
        "${arriveBy}", "${maxPreTransitWalkDistance}", "${walkSpeed}", "${minimumTransferTime}", "${useFlex}")`

        bigQuery.query({ query, useLegacySql: false })
    } catch (error) {
        logger.error(`Failed storing analytics for transit search from: ${client}`, { client, error })
    }
}

function getTableForClient(client: string): string | undefined {
    if (process.env.ENVIRONMENT !== 'prod') return
    if(client.startsWith('entur-client-app')) return 'entur-prod.analytics_app.transit_search'
    if(client.startsWith('entur-client-web')) return 'entur-prod.analytics_web.transit_search'
}
