import { createClient } from 'redis'

import logger from './logger'
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
    const redisPassword = await getSecret('REDIS_PASSWORD')
    const redisHost = await getSecret('REDIS_HOST')
    const redisPort = await getSecret('REDIS_PORT')
    logger.info('Loaded redis config from secrets')
    return {
        redisHost,
        redisPort: Number(redisPort),
        redisPassword,
    }
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

    await client.connect()
    logger.info('Redis client connected')

    setCache = async (
        key: string,
        value: any,
        expireInSeconds: number = DEFAULT_EXPIRE,
    ): Promise<void> => {
        void client.setEx(key, expireInSeconds, JSON.stringify(value))
    }

    getCache = async (key: string, expireInSeconds: number) => {
        const entry = await client.getEx(key, { EX: expireInSeconds })

        if (entry === null) return null

        return JSON.parse(entry)
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
