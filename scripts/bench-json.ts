import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface Options {
  directory: string
  output: string
}

export function benchmarkJsonArgs(major: number, output: string): string[] {
  if (major === 4) return ['vitest', 'bench', '--run', '--outputJson', output]
  if (major === 5) return ['vitest', 'bench', '--run', '--reporter=json', `--outputFile=${output}`]
  throw new Error(`Unsupported Vitest major: ${major}`)
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires an argument`)
  return value
}

function parseArgs(args: string[]): Options {
  let directory = process.cwd()
  let output = 'bench-results.json'

  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--directory') {
      directory = resolve(requireValue(args, index, '--directory'))
      index++
    } else if (args[index] === '--output') {
      output = requireValue(args, index, '--output')
      index++
    } else {
      throw new Error(`Unknown argument: ${args[index]}`)
    }
  }

  return { directory, output: resolve(output) }
}

function readVitestMajor(directory: string): number {
  const packagePath = join(directory, 'node_modules', 'vitest', 'package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }
  if (typeof packageJson.version !== 'string')
    throw new Error(`Missing Vitest version in ${packagePath}`)
  const major = Number.parseInt(packageJson.version.split('.')[0], 10)
  if (!Number.isInteger(major)) throw new Error(`Invalid Vitest version: ${packageJson.version}`)
  return major
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2))
    const major = readVitestMajor(options.directory)
    const executable = process.platform === 'win32' ? 'bunx.exe' : 'bunx'
    const result = spawnSync(executable, benchmarkJsonArgs(major, options.output), {
      cwd: options.directory,
      stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  } catch (error: unknown) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

if (import.meta.main) main()
