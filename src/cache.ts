import { createClient } from 'redis'
import { Storage } from '@google-cloud/storage'

import logger from './logger'
import { getProjectId } from './utils/project'
import semver from 'semver/preload'
import { getSecret } from './secrets'

const PROD = process.env.NODE_ENV === 'production'

// Functions are unavailable until Redis is Ready.
let setCache:
    | ((key: string, value: any, expireInSeconds: number) => Promise<void>)
    | undefined
let getCache:
    | (<T>(key: string, expireInSeconds: number) => Promise<T | null>)
    | undefined

interface Config {
    redisHost: string
    redisPort: number
    redisPassword?: string
}

async function getRedisConfig(): Promise<Config> {
    try {
        const redisPassword = await getSecret('REDIS_PASSWORD')
        const redisHost = await getSecret('REDIS_HOST')
        const redisPort = await getSecret('REDIS_PORT')
        if (redisPassword && redisPassword !== '') {
            logger.info('Loaded redis config from secrets')
            return {
                redisHost,
                redisPort: Number(redisPort),
                redisPassword,
            }
        }
    } catch {
        // fall back to 'old' config
    }

    // Redis ip and port are stored in a cloud storage bucket when
    // environment is terraformed (or set manually if terraform is not used)
    const storage = new Storage()
    const bucket = storage.bucket(`gs://${getProjectId()}-bff-search-config`)

    const file = await bucket.file('config.json').download()
    const content = file[0].toString()

    const parsed = JSON.parse(content) as Config
    if (!parsed.redisPort || !parsed.redisHost) {
        throw new Error('Error reading Redis config file')
    }

    logger.info('Loaded redis config from bucket')
    return parsed
}

// TODO: remove after upgrading redis in all environments
// GETEX requires redis version 6.2.0
function useLegacyOperations(response: string): boolean {
    const info = response
        .split('\n')
        .reduce<Record<string, string>>((acc, line) => {
            const [key, value] = line.trim().split(':') || []
            return key && value ? { ...acc, [key]: value } : acc
        }, {})
    const version = info['redis_version']
    logger.info(`Redis server version: ${version}`)

    return version ? semver.lt(version, '6.2.0') : true
}

async function setupCache(): Promise<void> {
    const config = PROD
        ? await getRedisConfig()
        : { redisHost: 'localhost', redisPort: 6379 }

    logger.info('Loaded redis config', { config })

    const url = config.redisPassword
        ? `redis://:${config.redisPassword}@${config.redisHost}:${config.redisPort}`
        : `redis://${config.redisHost}:${config.redisPort}`

    const client = createClient({ url })

    client.on('error', (err) => logger.error('Redis error caught', err))

    await client.connect().then(() => logger.info('Redis client connected'))

    const useLegacy = useLegacyOperations(await client.info())

    setCache = async (
        key: string,
        value: any,
        expireInSeconds: number = DEFAULT_EXPIRE,
    ): Promise<void> => {
        void client.setEx(key, expireInSeconds, JSON.stringify(value))
    }

    getCache = async (key: string, expireInSeconds: number) => {
        const entry = useLegacy
            ? await client.get(key).then(async (value) => {
                  if (value) await client.expire(key, expireInSeconds)
                  return value
              })
            : await client.getEx(key, { EX: expireInSeconds })

        if (entry === null) return null

        const parsed = JSON.parse(entry)

        // TODO: remove after being deployed for some hours
        // Only used for migrating from HGET/HSET to GET/SET
        if (parsed.data) {
            if (setCache) await setCache(key, parsed.data, expireInSeconds)
            return parsed.data
        }

        return parsed
    }
}

const DEFAULT_EXPIRE = 45 * 60 // 45 minutes

export async function set<T>(
    key: string,
    value: T,
    expireInSeconds: number = DEFAULT_EXPIRE,
): Promise<void> {
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

setupCache().catch((err) =>
    logger.error('Could not initialize Redis cache properly', err),
)
