import redis from 'redis'
import { promisify } from 'util'

import logger from './logger'

const DEV = process.env.NODE_ENV === 'development'
const REDIS_HOST = DEV ? 'localhost' : process.env.REDIS_HOST
const REDIS_PORT = DEV ? 6379 : Number(process.env.REDIS_PORT)

const client = redis.createClient(REDIS_PORT, REDIS_HOST)

client.on('error', (err) => logger.error('REDIS ERROR:', err))

const hgetall = promisify(client.hgetall).bind(client)
const hmset = promisify(client.hmset).bind(client)
const expire = promisify(client.expire).bind(client)

const DEFAULT_EXPIRE = 30 * 60 // 30 minutes

export async function set(key: string, value: any, expireInSeconds: number = DEFAULT_EXPIRE): Promise<void> {
    await hmset([key, 'data', JSON.stringify(value)])
    await expire(key, expireInSeconds)
}

export async function get<T>(key: string): Promise<T | null> {
    const entry = await hgetall(key)

    if (entry === null) {
        return null
    }

    return JSON.parse(entry.data)
}
