import { describe, expect, it } from 'vitest'
import { memoryPolicy } from './ci-memory-policy'

const changes = (paths: string[]) => paths.map(path => ({ path }))

describe('memory qualification selection', () => {
  it.each(['push', 'schedule', 'workflow_dispatch', 'merge_group', 'unknown'])(
    'runs complete qualification for %s',
    event => {
      expect(memoryPolicy(event, true, changes(['docs/guide.md'])).mode).toBe('run')
    }
  )
  it('skips browser-test and documentation changes on PRs', () => {
    expect(
      memoryPolicy(
        'pull_request',
        false,
        changes(['e2e/fixtures.ts', 'playwright.config.ts', 'docs/testing.md', 'README.md'])
      ).mode
    ).toBe('skip')
  })
  it.each([
    'src/main.tsx',
    'electron/main.ts',
    'bun.lock',
    'vite.config.ts',
    'perf/electron-memory.ts',
    '.github/workflows/ci.yml',
    'unknown.txt',
  ])('requires qualification for %s even alongside safe changes', file => {
    expect(memoryPolicy('pull_request', false, changes(['docs/guide.md', file])).mode).toBe('run')
    expect(memoryPolicy('pull_request', true, changes([file])).mode).toBe('defer')
  })
  it('cannot hide runtime deletion by renaming it into docs', () => {
    expect(
      memoryPolicy('pull_request', false, changes(['src/runtime.ts', 'docs/runtime.ts'])).mode
    ).toBe('run')
  })
  it('does not accept empty or unproven changes', () => {
    expect(memoryPolicy('pull_request', false, []).mode).toBe('run')
    expect(memoryPolicy('pull_request', true, []).mode).toBe('defer')
  })
  it('ignores only the package version while preserving dependency and script impact', () => {
    const before = JSON.stringify({
      version: '1',
      dependencies: { react: '19' },
      scripts: { build: 'vite' },
    })
    const after = JSON.stringify({
      version: '2',
      dependencies: { react: '19' },
      scripts: { build: 'vite' },
    })
    expect(
      memoryPolicy('pull_request', false, [{ path: 'package.json', before, after }]).mode
    ).toBe('skip')
    for (const replacement of [after.replace('19', '20'), after.replace('vite', 'other')]) {
      expect(
        memoryPolicy('pull_request', false, [{ path: 'package.json', before, after: replacement }])
          .mode
      ).toBe('run')
    }
    expect(memoryPolicy('pull_request', false, [{ path: 'package.json' }]).mode).toBe('run')
  })
  it('fails rather than silently skipping malformed package metadata', () => {
    expect(() =>
      memoryPolicy('pull_request', false, [{ path: 'package.json', before: '{', after: '{}' }])
    ).toThrow()
  })
})
