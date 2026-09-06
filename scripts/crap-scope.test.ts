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
  it('keeps future production features in scope and excludes only step definitions', () => {
    expect(isMeasuredFile('src/features/runtime.ts')).toBe(true)
    expect(isMeasuredFile('src/features/runtime.steps.ts')).toBe(false)
  })
})
