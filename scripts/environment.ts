import { join } from 'path'
import { promisify } from 'util'
import fs from 'fs'

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)

const [, , ENV = 'dev', ...args] = process.argv
const ENV_FILE = join(__dirname, `../.env.${ENV}`)
const CONFIG_FILE = join(__dirname, `../dist/config.js`)
void createConfigFile()

if (args.includes('--with-types')) {
    createTypeDefinition().catch((error) => {
        console.error('Failed creating type definition', error)
    })
}

if (args.includes('--watch')) {
    // eslint-disable-next-line fp/no-mutating-methods
    fs.watch(ENV_FILE, () => {
        void createConfigFile()
    })
    // eslint-disable-next-line fp/no-mutating-methods
    fs.watch(CONFIG_FILE, () => {
        void createConfigFile()
    })
}

async function readEnvFile(filePath: string): Promise<Record<string, string>> {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')

    return lines.reduce((map, line) => {
        const [key, value] = line.split('=').map((s) => s.trim())
        if (!key) return map
        return {
            ...map,
            [key]: value,
        }
    }, {})
}

async function createTypeDefinition(): Promise<void> {
    const envConfig = await readEnvFile(ENV_FILE)
    const format = (key: string): string => `export const ${key}: string`

    const content = `${Object.keys(envConfig).map(format).join('\n')}
`

    return writeFile(join(__dirname, '../src/config.d.ts'), content)
}

async function createConfigFile(): Promise<void> {
    try {
        const envConfig = await readEnvFile(ENV_FILE)
        const configFile = await readEnvFile(CONFIG_FILE)

        const currentConfig = Object.entries(configFile).reduce(
            (acc, [key, value]) => {
                if (!key.startsWith('exports.')) return acc
                return {
                    ...acc,
                    [key.slice(8)]: value.slice(1, value.length - 2),
                }
            },
            {},
        )

        const shouldNotWriteConfigFile =
            Object.keys(envConfig).length ===
                Object.keys(currentConfig).length &&
            Object.entries(currentConfig).every(
                ([key, value]) => value === envConfig[key],
            )

        if (shouldNotWriteConfigFile) return

        const format = ([key, value]: [string, string]): string =>
            `exports.${key} = "${value}";`

        const content = `"use strict";
    Object.defineProperty(exports, "__esModule", { value: true });

    ${Object.entries(envConfig).map(format).join('\n')}
    `

        await mkdir(join(__dirname, '..', 'dist'), { recursive: true })
        await writeFile(CONFIG_FILE, content)
    } catch (error) {
        console.error(error)
        process.exit(1)
    }
}
