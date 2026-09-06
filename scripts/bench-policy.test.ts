import { describe, expect, it } from 'vitest'
import { benchmarkPolicy } from './bench-policy'

const pkg = {
  version: '1.0.0',
  dependencies: { 'cron-parser': '5.0.0' },
  devDependencies: { vitest: '4.1.11' },
  scripts: { bench: 'vitest bench' },
}

describe('benchmark impact policy', () => {
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
