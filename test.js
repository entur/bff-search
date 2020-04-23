const redis = require('redis')
const { promisify } = require('util')

const REDISHOST = process.env.REDISHOST || 'localhost'
const REDISPORT = Number(process.env.REDISPORT || 6379)

const client = redis.createClient(REDISPORT, REDISHOST)

client.on('error', (err) => console.error('ERR:REDIS:', err))

const hgetall = promisify(client.hgetall).bind(client)
const hmset = promisify(client.hmset).bind(client)
const expire = promisify(client.expire).bind(client)

const DEFAULT_EXPIRE = 30 * 60 // 30 minutes

async function set(key, value, expireIn) {
    await hmset([key, 'data', JSON.stringify(value)])
    await expire(key, expireIn || DEFAULT_EXPIRE)
}

async function get(key) {
    const entry = await hgetall(key)

    if (entry === null) {
        return null
    }

    return JSON.parse(entry.data)
}

async function main() {
    try {
        const key = 'cheese'

        console.log('setting')
        await set(key, {
            cheese: 'camembert',
        })

        console.log('expiring')

        const value = await get('key')

        console.log(value)

        client.quit()
    } catch (error) {
        console.error(error)
        client.quit()
    }
}

main()
