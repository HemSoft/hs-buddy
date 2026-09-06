import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { benchmarkPolicy } from './bench-policy'

const pkg = {
  version: '1.0.0',
  dependencies: { 'cron-parser': '5.0.0' },
  devDependencies: { vitest: '4.1.11' },
  scripts: { bench: 'vitest bench' },
}

// Hooks export repository-local Git variables. Temporary repositories must not
// inherit them, including when the policy CLI launches Git itself.
const fixtureEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
)

describe('benchmark impact policy', () => {
  it('preserves the deployment-only main push exclusion as a successful skip', () => {
    expect(benchmarkPolicy(['.sfl/sfl.json', 'sfl.json'], pkg, pkg, 'push').mode).toBe('skip')
    expect(
      benchmarkPolicy(['.sfl/sfl.json', 'src/utils/dateUtils.ts'], pkg, pkg, 'push').mode
    ).toBe('enforce')
  })
})

describe('benchmark policy CLI', () => {
  it.each(['documentation', 'initial history'])(
    'handles %s through the real Git/event CLI',
    kind => {
      const directory = mkdtempSync(join(tmpdir(), 'bench-policy-test-'))
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: directory, encoding: 'utf8', env: fixtureEnv }).trim()
      const commit = () => {
        git('add', '.')
        git(
          '-c',
          'user.name=Benchmark Test',
          '-c',
          'user.email=benchmark@example.test',
          'commit',
          '-qm',
          'fixture'
        )
      }
      try {
        git('init', '-q')
        git('config', 'core.autocrlf', 'false')
        writeFileSync(join(directory, 'package.json'), JSON.stringify(pkg))
        commit()
        const base = git('rev-parse', 'HEAD')
        if (kind === 'documentation') {
          writeFileSync(join(directory, 'README.md'), 'Documentation only\n')
          writeFileSync(
            join(directory, 'package.json'),
            JSON.stringify({ ...pkg, version: '1.0.1' })
          )
          commit()
        }
        const eventPath = join(directory, 'event.json')
        writeFileSync(
          eventPath,
          JSON.stringify(kind === 'documentation' ? { pull_request: { base: { sha: base } } } : {})
        )
        const result = spawnSync('bun', [resolve('scripts/bench-policy.ts')], {
          cwd: directory,
          encoding: 'utf8',
          env: {
            ...fixtureEnv,
            GITHUB_EVENT_NAME: kind === 'documentation' ? 'pull_request' : 'workflow_dispatch',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_OUTPUT: join(directory, 'output.txt'),
            GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
          },
        })
        expect(result.status, result.stderr).toBe(0)
        const mode = kind === 'documentation' ? 'skip' : 'advisory'
        expect(JSON.parse(readFileSync(join(directory, 'bench-policy.json'), 'utf8')).mode).toBe(
          mode
        )
        expect(readFileSync(join(directory, 'output.txt'), 'utf8')).toContain(`mode=${mode}`)
        expect(readFileSync(join(directory, 'summary.md'), 'utf8')).toContain(
          kind === 'documentation' ? 'No benchmarked runtime' : 'No earlier revision'
        )
      } finally {
        rmSync(directory, { recursive: true })
      }
    }
  )
})

describe('benchmark runtime and harness classification', () => {
  it('skips documentation and automatic package metadata bumps', () => {
    expect(
      benchmarkPolicy(
        ['docs/guide.md', 'CHANGELOG.md', 'package.json'],
        pkg,
        { ...pkg, version: '1.0.1' },
        'pull_request'
      ).mode
    ).toBe('skip')
  })
  it.each([
    'src/utils/dateUtils.ts',
    'electron/services/copilotSessionService.ts',
    'convex/lib/cronUtils.ts',
    'shared/constants.ts',
    'perf/ipc-throughput.ts',
    'bun.lock',
  ])('enforces runtime/dependency change %s', file => {
    expect(benchmarkPolicy([file], pkg, pkg, 'pull_request').mode).toBe('enforce')
  })
  it('enforces production dependency upgrades instead of making all dependencies advisory', () => {
    expect(
      benchmarkPolicy(
        ['package.json'],
        pkg,
        { ...pkg, dependencies: { 'cron-parser': '5.1.0' } },
        'pull_request'
      ).mode
    ).toBe('enforce')
  })
  it.each([
    'src/utils/dateUtils.bench.ts',
    'scripts/bench-median.ts',
    'vitest.config.ts',
    'tsconfig.json',
    'tsconfig.node.json',
    'bunfig.toml',
    '.github/workflows/benchmarks.yml',
    '.github/actions/setup-bun/action.yml',
    'src/test/setup.ts',
  ])('explains harness change %s', file => {
    const policy = benchmarkPolicy([file], pkg, pkg, 'pull_request')
    expect(policy.mode).toBe('advisory')
    expect(policy.reasons.join(' ')).toContain(file)
  })
  it('explains toolchain and benchmark command changes', () => {
    for (const change of [
      { devDependencies: { vitest: '5.0.0' } },
      { scripts: { bench: 'vitest bench --run' } },
      { engines: { node: '25' } },
    ]) {
      const policy = benchmarkPolicy(['package.json'], pkg, { ...pkg, ...change }, 'pull_request')
      expect(policy.mode).toBe('advisory')
      expect(policy.reasons.length).toBeGreaterThan(0)
    }
  })
  it.each(['push', 'workflow_dispatch', 'merge_group', 'schedule'])(
    'retains comparison on %s',
    event => {
      expect(benchmarkPolicy([], pkg, pkg, event).mode).toBe('enforce')
    }
  )
})
