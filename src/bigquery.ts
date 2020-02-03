import { BigQuery } from '@google-cloud/bigquery'

import { SearchParams } from '../types'

import logger from './logger'

const env = process.env.ENVIRONMENT
const bigQuery = new BigQuery({ projectId: env })
const TABLES = {
    PROD: {
        APP: {
            TRANSIT_SEARCH: 'entur-prod.analytics_app.transit_search',
        },
        WEB: {
            TRANSIT_SEARCH: 'entur-prod.analytics_web.transit_search',
        },
    },
}

export function logAppTransitAnalytics(params: SearchParams): void {
    if (env !== 'prod') return // Do not save analytics when not in production

    try {
        logTransitAnalytics(TABLES.PROD.APP.TRANSIT_SEARCH, params)
    } catch (error) {
        logFailure('APP transit search', error)
    }
}

export function logWebTransitAnalytics(params: SearchParams): void {
    if (env !== 'prod') return // Do not save analytics when not in production

    try {
        logTransitAnalytics(TABLES.PROD.WEB.TRANSIT_SEARCH, params)
    } catch (error) {
        logFailure('WEB transit search', error)
    }
}

function logTransitAnalytics(table: string, params: SearchParams): void {
    const {
        from, to, searchDate, searchFilter = [], arriveBy, maxPreTransitWalkDistance,
        walkSpeed, minimumTransferTime, useFlex,
    } = params
    const query = `INSERT INTO \`${table}\`
        (fromName, fromPlace, toName, toPlace, searchDate, searchFilter, arriveBy)
        VALUES ("${from.name}", "${from.place}", "${to.name}", "${to.place}", "${searchDate}", "${searchFilter.join()}",
        "${arriveBy}", "${maxPreTransitWalkDistance}", "${walkSpeed}", "${minimumTransferTime}", "${useFlex}")`

    bigQuery.query({ query, useLegacySql: false })
}

function logFailure(type: string, error?: any): void {
    const meta = error ? { error } : undefined

    logger.error(`Failed storing analytics for: ${type}`, meta)
}
