import { describe, it, expect, vi } from 'vitest'
import {
  shouldCheckWindowsMachineScope,
  buildPowershellEnvCommand,
  resolveEnvVar,
  createEnvResolver,
} from './envLookup'

describe('shouldCheckWindowsMachineScope', () => {
  const allowed = new Set(['TEMPO_API_TOKEN', 'TODOIST_API_TOKEN'])

  it('returns true for win32 + allowed name', () => {
    expect(shouldCheckWindowsMachineScope('win32', 'TEMPO_API_TOKEN', allowed)).toBe(true)
  })

  it('returns false for non-windows platform', () => {
    expect(shouldCheckWindowsMachineScope('darwin', 'TEMPO_API_TOKEN', allowed)).toBe(false)
    expect(shouldCheckWindowsMachineScope('linux', 'TEMPO_API_TOKEN', allowed)).toBe(false)
  })

  it('returns false for name not in allowed set', () => {
    expect(shouldCheckWindowsMachineScope('win32', 'RANDOM_VAR', allowed)).toBe(false)
  })

  it('returns false for empty name', () => {
    expect(shouldCheckWindowsMachineScope('win32', '', allowed)).toBe(false)
  })
})

describe('buildPowershellEnvCommand', () => {
  it('builds command for a simple name', () => {
    const cmd = buildPowershellEnvCommand('TEMPO_API_TOKEN')
    expect(cmd).toBe(
      `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('TEMPO_API_TOKEN','Machine')"`
    )
  })

  it('escapes single quotes in the name', () => {
    const cmd = buildPowershellEnvCommand("FOO'BAR")
    expect(cmd).toContain("FOO''BAR")
  })

  it('handles names without special characters', () => {
    const cmd = buildPowershellEnvCommand('SIMPLE')
    expect(cmd).toContain("'SIMPLE'")
  })
})

// --- resolveEnvVar ---

describe('resolveEnvVar', () => {
  const allowed = new Set(['MY_TOKEN'])

  it('returns cached value on hit', () => {
    const cache = new Map([['MY_TOKEN', 'cached-val']])
    const execFn = vi.fn()
    const result = resolveEnvVar('MY_TOKEN', cache, 'win32', allowed, {}, execFn)
    expect(result).toBe('cached-val')
    expect(execFn).not.toHaveBeenCalled()
  })

  it('reads from Machine scope on win32 for allowed names', () => {
    const cache = new Map<string, string>()
    const execFn = vi.fn().mockReturnValue('  machine-val  ')
    const result = resolveEnvVar('MY_TOKEN', cache, 'win32', allowed, {}, execFn)
    expect(result).toBe('machine-val')
    expect(cache.get('MY_TOKEN')).toBe('machine-val')
    expect(execFn).toHaveBeenCalledOnce()
  })

  it('falls back to env when Machine scope returns empty', () => {
    const cache = new Map<string, string>()
    const execFn = vi.fn().mockReturnValue('  ')
    const result = resolveEnvVar(
      'MY_TOKEN',
      cache,
      'win32',
      allowed,
      { MY_TOKEN: 'env-val' },
      execFn
    )
    expect(result).toBe('env-val')
    expect(cache.get('MY_TOKEN')).toBe('env-val')
  })

  it('falls back to env when Machine scope throws', () => {
    const cache = new Map<string, string>()
    const execFn = vi.fn().mockImplementation(() => {
      throw new Error('timeout')
    })
    const result = resolveEnvVar(
      'MY_TOKEN',
      cache,
      'win32',
      allowed,
      { MY_TOKEN: 'env-val' },
      execFn
    )
    expect(result).toBe('env-val')
  })

  it('skips Machine scope on non-windows', () => {
    const cache = new Map<string, string>()
    const execFn = vi.fn()
    const result = resolveEnvVar(
      'MY_TOKEN',
      cache,
      'darwin',
      allowed,
      { MY_TOKEN: 'env-val' },
      execFn
    )
    expect(result).toBe('env-val')
    expect(execFn).not.toHaveBeenCalled()
  })

  it('returns undefined when not found anywhere', () => {
    const cache = new Map<string, string>()
    const execFn = vi.fn()
    const result = resolveEnvVar('MISSING', cache, 'darwin', allowed, {}, execFn)
    expect(result).toBeUndefined()
  })

  it('skips Machine scope for disallowed names on win32', () => {
    const cache = new Map<string, string>()
    const execFn = vi.fn()
    const result = resolveEnvVar('OTHER_VAR', cache, 'win32', allowed, { OTHER_VAR: 'val' }, execFn)
    expect(result).toBe('val')
    expect(execFn).not.toHaveBeenCalled()
  })
})

// --- createEnvResolver ---

describe('createEnvResolver', () => {
  it('creates a resolver that caches across calls', () => {
    const execFn = vi.fn()
    const getEnv = createEnvResolver('darwin', new Set(), { API_KEY: 'abc' }, execFn)
    expect(getEnv('API_KEY')).toBe('abc')
    expect(getEnv('API_KEY')).toBe('abc') // second call uses cache
    expect(execFn).not.toHaveBeenCalled()
  })

  it('creates isolated caches per resolver', () => {
    const execFn = vi.fn()
    const resolver1 = createEnvResolver('darwin', new Set(), { A: '1' }, execFn)
    const resolver2 = createEnvResolver('darwin', new Set(), { A: '2' }, execFn)
    expect(resolver1('A')).toBe('1')
    expect(resolver2('A')).toBe('2')
  })

  it('returns undefined for missing vars', () => {
    const getEnv = createEnvResolver('darwin', new Set(), {}, vi.fn())
    expect(getEnv('NOPE')).toBeUndefined()
  })
})
