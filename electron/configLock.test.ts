import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STALE_AFTER_MS, acquireConfigLock, lockDirFor, withConfigLock } from './configLock'

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
    const second = acquireConfigLock(configPath, {
      timeoutMs: 100,
      now: () => clock,
      sleep,
      warn,
    })
    expect(second).toBeNull()
    expect(sleep).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('busy for 100ms'))
    // The holder's lock is untouched by the loser.
    expect(existsSync(lockDirFor(configPath))).toBe(true)
    held?.()
  })

  it('takes over a stale lock left by a crashed holder', () => {
    const lockDir = lockDirFor(configPath)
    mkdirSync(lockDir)
    const past = (Date.now() - STALE_AFTER_MS - 5_000) / 1000
    utimesSync(lockDir, past, past)
    const sleep = vi.fn()
    const release = acquireConfigLock(configPath, { timeoutMs: 200, sleep })
    expect(release).not.toBeNull()
    expect(sleep).not.toHaveBeenCalled()
    release?.()
    expect(existsSync(lockDir)).toBe(false)
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
