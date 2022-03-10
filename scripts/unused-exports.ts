import { resolve, relative } from 'path'
import fs from 'fs'

import { codeFrameColumns } from '@babel/code-frame'
import analyzeTsConfig from 'ts-unused-exports'
import { Analysis } from 'ts-unused-exports/lib/analyzer'

/* eslint-disable no-console */

const projectRoot = resolve(__dirname, '..')
const tsConfigFilePath = resolve(projectRoot, 'tsconfig.json')

const maxFilesToDisplay = 50

function printInfo(message: unknown): void {
    console.log('\x1b[32m', message)
}

function printBox(value: string): void {
    const width = 60
    const padding = (width - value.length) / 2
    const startPadding = Math.floor(padding)
    const endPaddig = Math.ceil(padding)

    printInfo(`┌${'─'.repeat(width)}┐`)
    printInfo(`|${' '.repeat(startPadding)}${value}${' '.repeat(endPaddig)}|`)
    printInfo(`└${'─'.repeat(width)}┘`)
}

function printReport(result: Analysis): void {
    const frameOptions = {
        highlightCode: true,
        linesAbove: 0,
        linesBelow: 0,
    }
    const entries = Object.entries(result)

    entries
        .slice(0, maxFilesToDisplay)
        .forEach(([sourcePath, unusedExports]) => {
            const relativePath = relative(projectRoot, sourcePath)

            const source = fs.readFileSync(sourcePath, 'utf8')

            unusedExports.forEach(({ exportName, location }) => {
                console.log(`${exportName}: ${relativePath}`)

                if (location) {
                    const loc = {
                        start: {
                            line: location.line,
                            column: location.character,
                        },
                    }

                    console.log(codeFrameColumns(source, loc, frameOptions))
                }
                console.log('')
            })
        })

    if (entries.length > maxFilesToDisplay) {
        console.log('')
        console.log(
            `Showing ${maxFilesToDisplay} of ${entries.length} affected files`,
        )
        console.log('')
    }
}

function printSummary(result: Analysis, timeTook: number): void {
    const listOfUnusedExports = Object.values(result)
    const fileCount = listOfUnusedExports.length

    const unusedExportCount = listOfUnusedExports.reduce(
        (acc, unusedExports) => acc + unusedExports.length,
        0,
    )

    printBox(`Unused Exports Summary`)
    printInfo(`   Unused export count: ${unusedExportCount}  `)
    printInfo(`   Affected file count: ${fileCount}          `)
    printInfo(`          Completed in: ${timeTook} ms        `)
}

async function main(): Promise<void> {
    const timeStart = Date.now()

    const result = analyzeTsConfig(tsConfigFilePath, [
        '--excludePathsFromReport=src/generated/graphql.ts',
    ])

    const timeEnd = Date.now()
    const timeTook = timeEnd - timeStart

    printReport(result)
    printSummary(result, timeTook)
    console.log()

    if (Object.keys(result).length > 0) {
        process.exit(1)
    }
}

void main()
