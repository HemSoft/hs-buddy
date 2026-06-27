/**
 * Builds a stable vitest benchmark JSON file by taking the median numeric
 * values across multiple compatible benchmark runs.
 *
 * Usage:
 *   bun scripts/bench-median.ts --output bench-results.json run1.json run2.json ...
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildBenchmarkKey,
  isValidBenchOutput,
  normalizeFilepath,
  type BenchmarkOutput,
  type BenchmarkResult,
} from './bench-compare'

const ROOT = resolve(import.meta.dirname, '..')
const NUMERIC_BENCHMARK_FIELDS = [
  'rank',
  'hz',
  'mean',
  'min',
  'max',
  'p75',
  'p99',
  'p995',
  'p999',
  'rme',
  'sampleCount',
  'median',
] as const satisfies ReadonlyArray<keyof BenchmarkResult>

type NumericBenchmarkField = (typeof NUMERIC_BENCHMARK_FIELDS)[number]

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function cloneOutput(output: BenchmarkOutput): BenchmarkOutput {
  return {
    files: output.files.map(file => ({
      filepath: file.filepath,
      groups: file.groups.map(group => ({
        fullName: group.fullName,
        benchmarks: group.benchmarks.map(bench => ({ ...bench })),
      })),
    })),
  }
}

function mapBenchmarks(output: BenchmarkOutput): Map<string, BenchmarkResult> {
  const map = new Map<string, BenchmarkResult>()

  for (const file of output.files) {
    const normalizedPath = normalizeFilepath(file.filepath)
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        const key = buildBenchmarkKey(group, bench, normalizedPath)
        map.set(key, bench)
      }
    }
  }

  return map
}

function assertCompatibleRuns(runs: BenchmarkOutput[]): void {
  const reference = mapBenchmarks(runs[0])

  for (let i = 1; i < runs.length; i++) {
    const candidate = mapBenchmarks(runs[i])
    for (const key of reference.keys()) {
      if (!candidate.has(key)) {
        throw new Error(`Run ${i + 1} is missing benchmark: ${key}`)
      }
    }
    for (const key of candidate.keys()) {
      if (!reference.has(key)) {
        throw new Error(`Run ${i + 1} has unexpected benchmark: ${key}`)
      }
    }
  }
}

export function buildMedianBenchmarkOutput(runs: BenchmarkOutput[]): BenchmarkOutput {
  if (runs.length === 0) {
    throw new Error('At least one benchmark run is required')
  }

  assertCompatibleRuns(runs)

  const result = cloneOutput(runs[0])
  const runMaps = runs.map(mapBenchmarks)
  const resultMap = mapBenchmarks(result)

  for (const [key, resultEntry] of resultMap) {
    for (const field of NUMERIC_BENCHMARK_FIELDS) {
      const values = runMaps.map(runMap => {
        const value = runMap.get(key)?.[field]
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`Benchmark "${key}" has invalid ${field} value`)
        }
        return value
      })
      resultEntry[field as NumericBenchmarkField] = median(values)
    }
  }

  return result
}

function requireArgValue(args: string[], index: number, flag: string): string {
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
    throw new Error(`${flag} requires an argument`)
  }
  return args[index + 1]
}

function parseArgs(): { outputPath: string; inputPaths: string[] } {
  const args = process.argv.slice(2)
  let outputPath = resolve(ROOT, 'bench-results.json')
  const inputPaths: string[] = []

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output') {
      outputPath = resolve(ROOT, requireArgValue(args, i, '--output'))
      i++
    } else if (args[i].startsWith('--')) {
      throw new Error(`Unknown argument: ${args[i]}`)
    } else {
      inputPaths.push(resolve(ROOT, args[i]))
    }
  }

  if (inputPaths.length === 0) {
    throw new Error('At least one benchmark input file is required')
  }

  return { outputPath, inputPaths }
}

function loadBenchmarkOutput(path: string): BenchmarkOutput {
  if (!existsSync(path)) {
    throw new Error(`Benchmark input file not found: ${path}`)
  }

  const data: unknown = JSON.parse(readFileSync(path, 'utf-8'))
  if (!isValidBenchOutput(data)) {
    throw new Error(`Benchmark input file is not valid vitest bench JSON: ${path}`)
  }

  return data
}

function countBenchmarks(output: BenchmarkOutput): number {
  return output.files.reduce(
    (sum, file) =>
      sum + file.groups.reduce((groupSum, group) => groupSum + group.benchmarks.length, 0),
    0
  )
}

function main(): void {
  try {
    const { outputPath, inputPaths } = parseArgs()
    const runs = inputPaths.map(loadBenchmarkOutput)
    const medianOutput = buildMedianBenchmarkOutput(runs)

    writeFileSync(outputPath, JSON.stringify(medianOutput, null, 2) + '\n')
    console.log(
      `Wrote median benchmark output (${countBenchmarks(medianOutput)} benchmarks from ${runs.length} runs) -> ${outputPath}`
    )
  } catch (error: unknown) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
