import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
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
  let lockDir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'buddy-config-lock-'))
    configPath = join(dir, 'config.json')
    lockDir = lockDirFor(configPath)
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
    expect(existsSync(lockDir)).toBe(true)
    release?.()
    expect(existsSync(lockDir)).toBe(false)
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
    expect(existsSync(lockDir)).toBe(true)
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

  it('takes over a stale lock in place and releases it fully', () => {
    mkdirSync(lockDir)
    ageDir(lockDir)
    const sleep = vi.fn()
    const release = acquireConfigLock(configPath, { timeoutMs: 200, sleep })
    expect(release).not.toBeNull()
    expect(sleep).not.toHaveBeenCalled()
    // Taken over in place: the same directory, now carrying the marker.
    expect(existsSync(join(lockDir, 'claim'))).toBe(true)
    release?.()
    expect(existsSync(lockDir)).toBe(false)
  })

  it('a taken-over lock looks fresh to the next waiter', () => {
    mkdirSync(lockDir)
    ageDir(lockDir)
    const owner = acquireConfigLock(configPath, { timeoutMs: 200, sleep: vi.fn() })
    expect(owner).not.toBeNull()
    const late = acquireConfigLock(configPath, { timeoutMs: 30, sleep: vi.fn() })
    expect(late).toBeNull()
    expect(existsSync(lockDir)).toBe(true)
    owner?.()
  })

  it('withdraws a claim when the directory is not the stale instance it observed', () => {
    mkdirSync(lockDir)
    ageDir(lockDir)
    let reads = 0
    // On the second clock read (the identity re-check after claiming), the
    // stale directory is replaced by a fresh one, as if its holder released
    // it and another writer acquired anew.
    const now = () => {
      reads += 1
      if (reads === 2) {
        rmSync(lockDir, { recursive: true, force: true })
        mkdirSync(lockDir)
      }
      return Date.now()
    }
    let clock = Date.now()
    const release = acquireConfigLock(configPath, {
      timeoutMs: 30,
      now: () => {
        const t = now()
        clock += 20
        return Math.max(t, clock)
      },
      sleep: vi.fn(),
    })
    // The fresh lock belongs to someone else: no takeover, timed out.
    expect(release).toBeNull()
    expect(existsSync(join(lockDir, 'claim'))).toBe(false)
    expect(existsSync(lockDir)).toBe(true)
  })

  it('only one of two claimers wins a stale lock, and the loser keeps polling', () => {
    mkdirSync(lockDir)
    ageDir(lockDir)
    mkdirSync(join(lockDir, 'claim')) // another waiter claimed it just now
    let clock = 1_000
    const sleep = vi.fn((ms: number) => {
      clock += ms
    })
    const release = acquireConfigLock(configPath, { timeoutMs: 50, now: () => clock, sleep })
    expect(release).toBeNull()
    // No busy spin: the loser slept and respected the deadline.
    expect(sleep).toHaveBeenCalled()
    expect(existsSync(join(lockDir, 'claim'))).toBe(true)
  })

  it('clears a marker left by a crashed claimer and takes the lock over', () => {
    mkdirSync(lockDir)
    mkdirSync(join(lockDir, 'claim'))
    ageDir(join(lockDir, 'claim'))
    ageDir(lockDir)
    const release = acquireConfigLock(configPath, { timeoutMs: 200, sleep: vi.fn() })
    expect(release).not.toBeNull()
    release?.()
    expect(existsSync(lockDir)).toBe(false)
  })

  it('retries when a stale lock vanishes before it can be observed', () => {
    mkdirSync(lockDir)
    ageDir(lockDir)
    let reads = 0
    const now = () => {
      reads += 1
      if (reads === 2) rmSync(lockDir, { recursive: true, force: true })
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
    expect(existsSync(lockDir)).toBe(false)
  })

  it('runs the callback under the lock and releases even when it throws', () => {
    expect(() =>
      withConfigLock(configPath, () => {
        expect(existsSync(lockDir)).toBe(true)
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(existsSync(lockDir)).toBe(false)
  })

  it('proceeds unlocked when the lock directory cannot be created', () => {
    const warn = vi.fn()
    const release = acquireConfigLock(join(dir, 'missing', 'deeper', 'config.json'), { warn })
    expect(release).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('proceeding unlocked'))
  })
})
