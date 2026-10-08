/**
 * Cross-process advisory lock for the shared `config.json`.
 *
 * The native app (`rust/crates/buddy-core/src/config_lock.rs`) and this
 * process both read-modify-write the same file. The lock is a directory next
 * to it (`config.json.lock`) created with `mkdir`, which is atomic on every
 * supported platform and needs no file-locking API that Node lacks. Both
 * sides follow the same protocol:
 *
 * - acquire: `mkdir`; on `EEXIST`, wait and retry;
 * - stale: a lock older than `STALE_AFTER_MS` belongs to a crashed holder. A
 *   waiter claims it by renaming it to a unique name (atomic, so of several
 *   waiters exactly one wins and the rest find the path free or freshly
 *   re-acquired), then deletes the renamed directory. The live lock path is
 *   never removed by a waiter;
 * - release: remove the directory;
 * - bounded: a writer that cannot acquire within the timeout proceeds anyway
 *   (logged), because a wedged lock must never freeze either app.
 *
 * Electron's `conf` store re-reads the file inside every `set`, so holding
 * the lock around `set` serialises its read-modify-write against the native
 * app's `Settings::update`, which holds the same lock across its own.
 *
 * The wait is synchronous because `conf` writes synchronously on the main
 * process. The native holder's critical section is a few milliseconds, so
 * the Electron wait is short (`DEFAULT_TIMEOUT_MS`) and polls quickly.
 */
import { mkdirSync, renameSync, rmSync, rmdirSync, statSync } from 'node:fs'

/** A holder that has not touched its lock for this long is presumed dead. */
export const STALE_AFTER_MS = 10_000
/** How long a writer waits for the lock before proceeding unlocked. */
const DEFAULT_TIMEOUT_MS = 250
const POLL_MS = 10

export function lockDirFor(configPath: string): string {
  return `${configPath}.lock`
}

function isStale(dir: string, now: number): boolean {
  try {
    return now - statSync(dir).mtimeMs > STALE_AFTER_MS
  } catch (_: unknown) {
    // Vanished between EEXIST and stat: the holder released it.
    return false
  }
}

/**
 * Take a stale lock out of the way without ever touching a live one: the
 * rename is atomic, so of several waiters exactly one moves it; the rest get
 * ENOENT and simply retry `mkdir`.
 */
function claimStale(dir: string): void {
  const claimed = `${dir}.stale-${process.pid}-${process.hrtime.bigint()}`
  try {
    renameSync(dir, claimed)
  } catch (_: unknown) {
    return
  }
  rmSync(claimed, { recursive: true, force: true })
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

type CreateOutcome = 'acquired' | 'exists' | { failed: string }

function tryCreate(dir: string): CreateOutcome {
  try {
    mkdirSync(dir)
    return 'acquired'
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'EEXIST' ? 'exists' : { failed: code ?? 'unknown' }
  }
}

function releaseQuietly(dir: string): void {
  try {
    rmdirSync(dir)
  } catch (_: unknown) {
    /* already released, or claimed as stale by a waiter after a long pause */
  }
}

export interface LockOptions {
  timeoutMs?: number
  /** Injectable clock for tests. */
  now?: () => number
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => void
  warn?: (message: string) => void
}

interface ResolvedOptions {
  timeoutMs: number
  now: () => number
  sleep: (ms: number) => void
  warn: (message: string) => void
}

function resolveOptions(options: LockOptions): ResolvedOptions {
  return {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    now: options.now ?? Date.now,
    sleep: options.sleep ?? sleepSync,
    warn: options.warn ?? (() => undefined),
  }
}

/**
 * Acquire the lock for `configPath`. Returns a release function, or `null`
 * when the wait ran out and the caller should proceed unlocked.
 */
export function acquireConfigLock(
  configPath: string,
  options: LockOptions = {}
): (() => void) | null {
  const { timeoutMs, now, sleep, warn } = resolveOptions(options)
  const dir = lockDirFor(configPath)
  const deadline = now() + timeoutMs
  for (;;) {
    const outcome = tryCreate(dir)
    if (outcome === 'acquired') return () => releaseQuietly(dir)
    if (outcome !== 'exists') {
      // No lock directory can exist here (unwritable parent, say): there is
      // nothing to coordinate on, so proceed unlocked.
      warn(`[configLock] cannot create ${dir} (${outcome.failed}); proceeding unlocked`)
      return null
    }
    if (isStale(dir, now())) {
      claimStale(dir)
      continue
    }
    if (now() >= deadline) {
      warn(`[configLock] ${dir} busy for ${timeoutMs}ms; proceeding unlocked`)
      return null
    }
    sleep(POLL_MS)
  }
}

/** Run `fn` while holding the config lock (or unlocked after the timeout). */
export function withConfigLock<T>(configPath: string, fn: () => T, options: LockOptions = {}): T {
  const release = acquireConfigLock(configPath, options)
  try {
    return fn()
  } finally {
    release?.()
  }
}
