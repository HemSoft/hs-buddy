import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { HarnessResult } from './electron-memory'
import { evaluateRuns, type ScenarioMetrics } from './electron-memory-model'

const SCENARIOS = [
  'dashboard-cold',
  'dashboard-warm',
  'settings-idle',
  'navigation-baseline',
  'navigation-cleanup',
  'terminal-first-cleanup',
  'terminal-baseline',
  'terminal-open',
  'terminal-cleanup',
  'browser-first-cleanup',
  'browser-baseline',
  'browser-open',
  'browser-cleanup',
]
const METRICS = [
  'totalWorkingSetBytes',
  'totalPrivateBytes',
  'rendererWorkingSetBytes',
  'rendererPrivateBytes',
  'v8UsedHeapBytes',
  'embedderHeapBytes',
  'domNodes',
  'documents',
  'eventListeners',
] as const

function validateScenarios(scenarios: Record<string, ScenarioMetrics>): void {
  for (const name of SCENARIOS) {
    const scenario = scenarios[name]
    for (const metric of METRICS) {
      const value = scenario?.[metric]
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Missing or invalid metric: ${name}.${metric}`)
      }
    }
  }
}

function validateSample(sample: HarnessResult, revision: string): void {
  if (sample.schema !== 1 || sample.platform !== 'win32' || sample.architecture !== 'x64') {
    throw new Error('Expected schema 1 Windows x64 memory sample')
  }
  if (!revision || sample.sourceRevision !== revision || sample.runs.length !== 1) {
    throw new Error('Memory samples must contain one run from the current revision')
  }
  validateProtocol(sample)
  if (sample.runs[0].mode !== 'packaged') throw new Error('Expected a packaged runtime')
  validateScenarios(sample.runs[0].scenarios)
}

function validateProtocol(sample: HarnessResult): void {
  const options = sample.options
  if (options.mode !== 'packaged' || options.warmupMs !== 300_000 || options.settleMs !== 5_000) {
    throw new Error('Memory sample changed the packaged measurement protocol')
  }
  if (options.runs !== 1 || options.navigationCycles !== 3 || options.budgetScale !== 1) {
    throw new Error('Memory sample changed repetition or budget settings')
  }
}

export function aggregateSamples(samples: HarnessResult[], revision: string) {
  if (samples.length !== 3) throw new Error('Exactly three memory samples are required')
  const ids = samples.map(sample => sample.sampleId).sort()
  if (JSON.stringify(ids) !== JSON.stringify(['1', '2', '3'])) {
    throw new Error('Expected distinct memory sample IDs 1, 2, and 3')
  }
  for (const sample of samples) validateSample(sample, revision)
  const identities = samples.map(sample =>
    JSON.stringify([sample.runnerImage, sample.runs[0].electronVersion, sample.runs[0].appVersion])
  )
  if (new Set(identities).size !== 1) throw new Error('Memory sample environments differ')
  const runs = samples.map(sample => sample.runs[0])
  // Reuse the serial evaluator, including per-profile cleanup ratios. Individual
  // sample budget failures are evidence; only the combined median decides the gate.
  const evaluation = evaluateRuns(
    'packaged',
    runs.map(run => run.scenarios),
    1
  )
  return {
    schema: 1,
    sourceRevision: revision,
    capturedAt: new Date().toISOString(),
    runs,
    ...evaluation,
    status: evaluation.failures.length === 0 ? 'pass' : 'fail',
  }
}

if (import.meta.main) {
  const [directory, output] = process.argv.slice(2)
  if (!directory || !output)
    throw new Error('Usage: electron-memory-aggregate.ts <samples> <output>')
  const files = (await readdir(directory)).filter(file => file.endsWith('.json'))
  const samples = await Promise.all(
    files.map(
      async file => JSON.parse(await readFile(path.join(directory, file), 'utf8')) as HarnessResult
    )
  )
  const result = aggregateSamples(samples, process.env.GITHUB_SHA ?? '')
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`Electron memory median: ${result.status}`)
  if (result.failures.length > 0) {
    console.error(JSON.stringify(result.failures, null, 2))
    process.exitCode = 1
  }
}
