import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STALE_AFTER_MS, acquireConfigLock, lockDirFor, withConfigLock } from './configLock'

function ageDir(dir: string): void {
  const past = (Date.now() - STALE_AFTER_MS - 5_000) / 1000
  utimesSync(dir, past, past)
}

describe('configLock', () => {
  let dir: string
  let configPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'buddy-config-lock-'))
    configPath = join(dir, 'config.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('names the lock directory next to the config file', () => {
    expect(lockDirFor('/x/Buddy/config.json')).toBe('/x/Buddy/config.json.lock')
  })

  it('acquires and releases', () => {
    const release = acquireConfigLock(configPath)
    expect(release).not.toBeNull()
    expect(existsSync(lockDirFor(configPath))).toBe(true)
    release?.()
    expect(existsSync(lockDirFor(configPath))).toBe(false)
  })

  it('waits for a held lock, then proceeds unlocked after the timeout', () => {
    const held = acquireConfigLock(configPath)
    expect(held).not.toBeNull()
    let clock = 1_000
    const sleep = vi.fn((ms: number) => {
      clock += ms
    })
    const warn = vi.fn()
    const second = acquireConfigLock(configPath, { timeoutMs: 100, now: () => clock, sleep, warn })
    expect(second).toBeNull()
    expect(sleep).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('busy for 100ms'))
    // The holder's lock is untouched by the loser.
    expect(existsSync(lockDirFor(configPath))).toBe(true)
    held?.()
  })

  it('waits in real time with the default sleep, then gives up quietly', () => {
    const held = acquireConfigLock(configPath)
    expect(held).not.toBeNull()
    const started = Date.now()
    // No injected clock, sleep or warn: exercises the real poll and the
    // default no-op warning.
    expect(acquireConfigLock(configPath, { timeoutMs: 40 })).toBeNull()
    expect(Date.now() - started).toBeGreaterThanOrEqual(10)
    held?.()
  })

  it('takes over a stale lock left by a crashed holder and leaves no remains', () => {
    const lockDir = lockDirFor(configPath)
    mkdirSync(lockDir)
    ageDir(lockDir)
    const sleep = vi.fn()
    const release = acquireConfigLock(configPath, { timeoutMs: 200, sleep })
    expect(release).not.toBeNull()
    expect(sleep).not.toHaveBeenCalled()
    expect(readdirSync(dir).filter(name => name.includes('.stale-'))).toEqual([])
    release?.()
    expect(existsSync(lockDir)).toBe(false)
  })

  it('never removes a lock that another waiter re-acquired after a takeover', () => {
    const lockDir = lockDirFor(configPath)
    mkdirSync(lockDir)
    ageDir(lockDir)
    // Waiter A claims the stale lock and holds a fresh one.
    const a = acquireConfigLock(configPath, { timeoutMs: 200, sleep: vi.fn() })
    expect(a).not.toBeNull()
    // Waiter B arrives late: the lock is fresh, so it waits and gives up
    // without touching A's directory.
    const b = acquireConfigLock(configPath, { timeoutMs: 30, sleep: vi.fn(), now: Date.now })
    expect(b).toBeNull()
    expect(existsSync(lockDir)).toBe(true)
    a?.()
  })

  it('retries when a stale lock vanishes before it can be claimed', () => {
    const lockDir = lockDirFor(configPath)
    mkdirSync(lockDir)
    ageDir(lockDir)
    let calls = 0
    // The first stale verdict is followed by the holder releasing the lock
    // (simulated by removing it on the first clock read after the check).
    const now = () => {
      calls += 1
      if (calls === 3) rmSync(lockDir, { recursive: true, force: true })
      return Date.now()
    }
    const release = acquireConfigLock(configPath, { timeoutMs: 200, sleep: vi.fn(), now })
    expect(release).not.toBeNull()
    release?.()
  })

  it('tolerates releasing twice', () => {
    const release = acquireConfigLock(configPath)
    release?.()
    expect(() => release?.()).not.toThrow()
    expect(existsSync(lockDirFor(configPath))).toBe(false)
  })

  it('runs the callback under the lock and releases even when it throws', () => {
    expect(() =>
      withConfigLock(configPath, () => {
        expect(existsSync(lockDirFor(configPath))).toBe(true)
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(existsSync(lockDirFor(configPath))).toBe(false)
  })

  it('proceeds unlocked when the lock directory cannot be created', () => {
    const warn = vi.fn()
    const release = acquireConfigLock(join(dir, 'missing', 'deeper', 'config.json'), { warn })
    expect(release).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('proceeding unlocked'))
  })
})
