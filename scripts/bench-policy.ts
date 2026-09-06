import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

type Package = Record<string, unknown>
export interface BenchmarkPolicy {
  mode: 'skip' | 'enforce' | 'advisory'
  reasons: string[]
}

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides',
]
const harnessPackages = [
  'vitest',
  'vite',
  '@vitejs/plugin-react',
  'happy-dom',
  '@vitest/coverage-v8',
]

function harnessPackage(pkg: Package, name: string): unknown[] {
  return dependencyFields.map(field => (pkg[field] as Package | undefined)?.[name])
}

function benchmarkScripts(pkg: Package): unknown {
  return Object.fromEntries(
    Object.entries((pkg.scripts ?? {}) as Package).filter(([name]) => name.startsWith('bench'))
  )
}

export function benchmarkPolicy(
  files: string[],
  before: Package,
  after: Package,
  event: string
): BenchmarkPolicy {
  const reasons = files
    .filter(file =>
      /(?:\.bench\.[cm]?[jt]sx?$|^scripts\/bench.*\.ts$|^vitest.*config\.|^vite\.config\.|^src\/test\/setup\.ts$|^\.github\/workflows\/benchmarks\.yml$|^\.github\/actions\/setup-bun\/|^\.(?:bun|node)-version$)/.test(
        file
      )
    )
    .map(file => `Benchmark harness or toolchain changed: ${file}`)
  for (const name of harnessPackages) {
    if (!isDeepStrictEqual(harnessPackage(before, name), harnessPackage(after, name)))
      reasons.push(`Benchmark toolchain dependency changed: ${name}`)
  }
  for (const field of ['engines', 'packageManager']) {
    if (!isDeepStrictEqual(before[field], after[field]))
      reasons.push(`Package toolchain configuration changed: ${field}`)
  }
  if (!isDeepStrictEqual(benchmarkScripts(before), benchmarkScripts(after)))
    reasons.push('Benchmark package scripts changed')
  if (reasons.length) return { mode: 'advisory', reasons }
  const dependenciesChanged = dependencyFields.some(
    field => !isDeepStrictEqual(before[field], after[field])
  )
  const runtimeChanged = files.some(
    file =>
      file === 'bun.lock' ||
      file === '.github/workflows/ci.yml' ||
      (/^(src|electron|convex|shared|perf)\//.test(file) &&
        !/(?:\.(test|spec)\.[jt]sx?$|\.md$)/.test(file) &&
        !/^src\/test\//.test(file))
  )
  if (dependenciesChanged || runtimeChanged || event !== 'pull_request')
    return { mode: 'enforce', reasons: ['Compare base and candidate on the same runner'] }
  return { mode: 'skip', reasons: ['No benchmarked runtime, dependency, or harness changes'] }
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

if (import.meta.main) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'))
  if (process.env.GITHUB_EVENT_NAME === 'pull_request' && !event.pull_request?.base?.sha) {
    throw new Error('Missing pull request baseline context')
  }
  const base =
    event.pull_request?.base?.sha ??
    event.merge_group?.base_sha ??
    (event.before && !/^0+$/.test(event.before) ? event.before : git('rev-parse', 'HEAD^'))
  if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('Invalid benchmark baseline SHA')
  const files = git('diff', '--no-renames', '--name-only', '-z', base, 'HEAD')
    .split('\0')
    .filter(Boolean)
  const policy = benchmarkPolicy(
    files,
    JSON.parse(git('show', `${base}:package.json`)),
    JSON.parse(readFileSync('package.json', 'utf8')),
    process.env.GITHUB_EVENT_NAME ?? ''
  )
  writeFileSync(
    'bench-policy.json',
    JSON.stringify({ ...policy, base, candidate: git('rev-parse', 'HEAD') }, null, 2) + '\n'
  )
  const summary = `## Benchmark gate: ${policy.mode}\n\n${policy.reasons.map(reason => `- ${reason}`).join('\n')}\n\nBase: ${base}\n\nCandidate: ${git('rev-parse', 'HEAD')}\n`
  console.log(summary)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY!, summary)
  appendFileSync(process.env.GITHUB_OUTPUT!, `mode=${policy.mode}\nbase=${base}\n`)
}
