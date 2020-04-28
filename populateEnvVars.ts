/* eslint-disable no-console */

import { resolve } from 'path'
import { promises as fsPromises } from 'fs'

const { readdir, readFile, writeFile } = fsPromises

const ENV = process.argv[2] || 'dev'
const ENV_FILE = `.env.${ENV}`

async function readEnvFile(): Promise<object> {
    const content = await readFile(ENV_FILE, 'utf-8')
    const lines = content.trim().split('\n')

    const envMap = lines.reduce((map, line) => {
        const [key, value] = line.split('=').map((s) => s.trim())
        return {
            ...map,
            [key]: value,
        }
    }, {})

    return envMap
}

async function getFiles(dir: string): Promise<string[]> {
    const dirents = await readdir(dir, { withFileTypes: true })
    const files = await Promise.all(
        dirents.map((dirent) => {
            const res = resolve(dir, dirent.name)
            if (dirent.isDirectory()) {
                return getFiles(res)
            }
            return [res]
        }),
    )

    return files.reduce((a, b) => [...a, ...b], []).filter((filePath) => filePath.endsWith('.js'))
}

type ReplacePattern = [string | RegExp, string]

async function findAndReplaceInFile(filePath: string, replacePatterns: ReplacePattern[]): Promise<void> {
    try {
        const content = await readFile(filePath, 'utf-8')
        const newContent = replacePatterns.reduce(
            (acc, [searchValue, replaceValue]) => acc.replace(searchValue, replaceValue),
            content,
        )
        await writeFile(filePath, newContent)
    } catch (error) {
        console.log(`Failed to update ${filePath}`)
        console.error(error)
    }
}

async function replaceEnvVariables(): Promise<void> {
    const config = await readEnvFile()
    const filePaths = await getFiles('dist')
    const patterns: ReplacePattern[] = Object.entries(config).map(([name, value]) => [
        new RegExp(`process.env.${name}(\\W)`, 'g'),
        `'${value}'$1`,
    ])
    await Promise.all(filePaths.map((path) => findAndReplaceInFile(path, patterns)))
}

replaceEnvVariables()
