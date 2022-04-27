import { createClient } from 'redis'

import logger from './logger'
import { REDIS_HOST, REDIS_PORT } from './config'

const PROD = process.env.NODE_ENV === 'production'

const host = PROD ? REDIS_HOST : 'localhost'
const port = PROD ? Number(REDIS_PORT) : 6379

const client = createClient({ url: `redis://${host}:${port}` })

client.on('error', (err) => logger.error('REDIS ERROR:', err))

const DEFAULT_EXPIRE = 30 * 60 // 30 minutes

export async function set(
    key: string,
    value: any,
    expireInSeconds: number = DEFAULT_EXPIRE,
): Promise<void> {
    logger.debug(`Cache set ${key}`)
    await client.HSET(key, 'data', JSON.stringify(value))
    await client.expire(key, expireInSeconds)
}

export async function get<T>(
    key: string,
    expireInSeconds: number = DEFAULT_EXPIRE,
): Promise<T | null> {
    const entry = await client.HGETALL(key)

    if (entry === null || entry.data === undefined) {
        return null
    }
    await client.expire(key, expireInSeconds)

    return JSON.parse(entry.data)
}
