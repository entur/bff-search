import redis from 'redis'
import { promisify } from 'util'
import { Storage } from '@google-cloud/storage'

import logger from './logger'
import { getProjectId } from './utils/project'

// Redis ip and port are stored in a cloud storage bucket when
// environment is terraformed (or set manually if terraform is not used)
const storage = new Storage()
const bucketUrl = `gs://${getProjectId()}-bff-search-config`

const PROD = process.env.NODE_ENV === 'production'

// Functions are unavailable until Redis is Ready.
let setCache:
    | ((key: string, value: any, expireInSeconds: number) => Promise<void>)
    | undefined
let getCache:
    | (<T>(key: string, expireInSeconds: number) => Promise<T | null>)
    | undefined

try {
    const bucket = storage.bucket(bucketUrl)
    const file = bucket.file('config.json')
    let contents = ''

    file.createReadStream()
        .on('error', (err) => {
            logger.error('Error reading Redis config file', { err })
        })
        .on('data', (chunk) => {
            contents += chunk
        })
        .on('end', () => {
            const config = JSON.parse(contents)
            logger.info('Loaded redis config from file', {
                config,
            })

            const host = PROD ? config.redisHost : 'localhost'
            const port = PROD ? Number(config.redisPort) : 6379

            const client = redis.createClient(port, host)

            client.on('error', (err) => logger.error('Redis error caught', err))

            const hgetall = promisify(client.hgetall).bind(client)
            const hset = promisify(client.hset).bind(client)
            const expire = promisify(client.expire).bind(client)

            setCache = async (
                key: string,
                value: any,
                expireInSeconds: number = DEFAULT_EXPIRE,
            ): Promise<void> => {
                logger.debug(`Cache set ${key}`)
                await hset([key, 'data', JSON.stringify(value)])
                await expire(key, expireInSeconds)
            }

            getCache = async (key: string, expireInSeconds: number) => {
                const entry = await hgetall(key)
                if (entry === null || entry.data === undefined) {
                    return null
                }
                await expire(key, expireInSeconds)

                return JSON.parse(entry.data)
            }
        })
} catch (err) {
    logger.error('Could not initialize Redis cache properly', err)
}

const DEFAULT_EXPIRE = 30 * 60 // 30 minutes

export async function set(
    key: string,
    value: any,
    expireInSeconds: number = DEFAULT_EXPIRE,
): Promise<void> {
    logger.debug(`Cache set ${key}`)
    if (setCache) await setCache(key, value, expireInSeconds)
}

export async function get<T>(
    key: string,
    expireInSeconds: number = DEFAULT_EXPIRE,
): Promise<T | null> {
    if (getCache) {
        return getCache(key, expireInSeconds)
    }
    return null
}
