import { join } from 'path'
import { promisify } from 'util'
import fs from 'fs'

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)

const [, , ENV = 'dev', ...args] = process.argv
const ENV_FILE = join(__dirname, `../.env.${ENV}`)
const SECRETS_FILE = join(__dirname, `../.secrets.${ENV}`)

createConfigFile()

if (args.includes('--with-types')) {
    createTypeDefinition()
}

if (args.includes('--watch')) {
    // eslint-disable-next-line fp/no-mutating-methods
    fs.watch(ENV_FILE, () => {
        createConfigFile()
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
    const [envConfig, secretsConfig] = await Promise.all([readEnvFile(ENV_FILE), readEnvFile(SECRETS_FILE)])
    const format = (key: string): string => `export const ${key}: string`

    const content = `${Object.keys({ ...envConfig, ...secretsConfig })
        .map(format)
        .join('\n')}
`

    return writeFile(join(__dirname, '../src/config.d.ts'), content)
}

async function createConfigFile(): Promise<void> {
    const [envConfig, secretsConfig] = await Promise.all([readEnvFile(ENV_FILE), readEnvFile(SECRETS_FILE)])
    const format = ([key, value]: [string, string]): string => `exports.${key} = "${value}";`

    const content = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

${Object.entries({ ...envConfig, ...secretsConfig })
    .map(format)
    .join('\n')}
`
    return writeFile(join(__dirname, '../dist/config.js'), content)
}
