import { beforeEach, describe, expect, it, vi } from 'vitest'

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }))
vi.mock('node:child_process', () => {
  const execFileSync = (_command: string, args: string[]) => {
    const roots = args.slice(args.indexOf('--') + 1)
    return [...files.keys()]
      .filter(file => roots.some(root => file.startsWith(`${root}/`)))
      .join('\0')
  }
  return { execFileSync, default: { execFileSync } }
})
vi.mock('node:fs', () => {
  const readFileSync = (file: string) => files.get(file) ?? 'configuration'
  return { readFileSync, default: { readFileSync } }
})
import { isMeasuredFile, sourceFingerprint } from './crap-scope'

describe('CRAP source freshness', () => {
  beforeEach(() => {
    files.clear()
    files.set('src/runtime.ts', 'export const value = 1')
  })
  it.each(['scripts/behavior.test.ts', 'perf/runtime.test.ts'])(
    'invalidates renderer evidence when selected test input %s changes or is added',
    file => {
      const initial = sourceFingerprint('renderer')
      files.set(file, 'test version one')
      const added = sourceFingerprint('renderer')
      expect(added).not.toBe(initial)
      files.set(file, 'test version two')
      expect(sourceFingerprint('renderer')).not.toBe(added)
    }
  )
  it('includes test helpers and normalizes checkout newlines', () => {
    files.set('scripts/helper.ts', 'one\r\ntwo')
    const fingerprint = sourceFingerprint('renderer')
    files.set('scripts/helper.ts', 'one\ntwo')
    expect(sourceFingerprint('renderer')).toBe(fingerprint)
    files.set('scripts/helper.ts', 'changed')
    expect(sourceFingerprint('renderer')).not.toBe(fingerprint)
  })
  it.each([
    'src/cross-suite.ts',
    'electron/cross-suite.ts',
    'shared/cross-suite.ts',
    'convex/cross-suite.ts',
    'scripts/cross-suite.ts',
    'perf/cross-suite.ts',
  ])('invalidates every suite when cross-suite input %s is added or changed', file => {
    const suites = ['renderer', 'electron', 'convex'] as const
    const initial = suites.map(sourceFingerprint)
    files.set(file, 'export const value = 1')
    const added = suites.map(sourceFingerprint)
    files.set(file, 'export const value = 2')
    for (const [index, suite] of suites.entries()) {
      expect(added[index]).not.toBe(initial[index])
      expect(sourceFingerprint(suite)).not.toBe(added[index])
    }
  })
  it.each(['tsconfig.json', 'tsconfig.node.json', 'tsconfig.convex.json', 'tsconfig.scripts.json'])(
    'invalidates every suite when compiler configuration %s changes',
    file => {
      const suites = ['renderer', 'electron', 'convex'] as const
      const initial = suites.map(sourceFingerprint)
      files.set(file, '{"compilerOptions":{"useDefineForClassFields":false}}')
      for (const [index, suite] of suites.entries())
        expect(sourceFingerprint(suite)).not.toBe(initial[index])
    }
  )
  it('keeps future production features in scope and excludes only step definitions', () => {
    expect(isMeasuredFile('src/features/runtime.ts')).toBe(true)
    expect(isMeasuredFile('src/features/runtime.steps.ts')).toBe(false)
  })
})
