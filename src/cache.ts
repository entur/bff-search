import redis from 'redis'
import { promisify } from 'util'

import logger from './logger'
import { REDIS_HOST, REDIS_PORT } from './config'

const PROD = process.env.NODE_ENV === 'production'

const host = PROD ? REDIS_HOST : 'localhost'
const port = PROD ? Number(REDIS_PORT) : 6379

const client = redis.createClient(port, host)

client.on('error', (err) => logger.error('REDIS ERROR:', err))

const hgetall = promisify(client.hgetall).bind(client)
const hset = promisify(client.hset).bind(client)
const expire = promisify(client.expire).bind(client)

const DEFAULT_EXPIRE = 30 * 60 // 30 minutes

export async function set(
    key: string,
    value: any,
    expireInSeconds: number = DEFAULT_EXPIRE,
): Promise<void> {
    logger.debug(`Cache set ${key}`)
    await hset([key, 'data', JSON.stringify(value)])
    await expire(key, expireInSeconds)
}

export async function get<T>(
    key: string,
    expireInSeconds: number = DEFAULT_EXPIRE,
): Promise<T | null> {
    const entry = await hgetall(key)

    if (entry === null || entry.data === undefined) {
        return null
    }
    await expire(key, expireInSeconds)

    return JSON.parse(entry.data)
}
