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
 * - stale: a lock whose mtime is older than `STALE_AFTER_MS` belongs to a
 *   crashed holder. A waiter takes it over *in place*: it creates the marker
 *   `claim` inside the directory (atomic, so exactly one waiter wins), then
 *   checks that the directory is still the instance it observed (same inode
 *   and birth time). A mismatch means the stale lock was released and a
 *   fresh one created meanwhile, so the waiter withdraws its marker and goes
 *   back to waiting. A marker that is itself older than `STALE_AFTER_MS`
 *   belongs to a claimer that crashed too and is removed before claiming.
 *   Nothing else is ever renamed or removed by a waiter, so a live lock
 *   cannot be stolen;
 * - release: the holder removes its marker (if any) and the directory;
 * - bounded: a writer that cannot acquire within the timeout proceeds anyway
 *   (logged), because a wedged lock must never freeze either app.
 *
 * Electron's `conf` store re-reads the file inside every `set`, so holding
 * the lock around `set` serialises its read-modify-write against the native
 * app's `Settings::update`, which holds the same lock across its own.
 *
 * The wait is synchronous because `conf` writes synchronously on the main
 * process. It only happens under actual contention (a native write at the
 * same instant), and the timeout covers the native holder's worst case: a
 * load-edit-save with the Windows rename retries (250 ms) and, once, the
 * legacy keychain migration.
 */
import { mkdirSync, rmdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** A holder that has not touched its lock for this long is presumed dead. */
export const STALE_AFTER_MS = 10_000
/** How long a writer waits for the lock before proceeding unlocked. */
const DEFAULT_TIMEOUT_MS = 1_000
const POLL_MS = 10
const CLAIM = 'claim'

export function lockDirFor(configPath: string): string {
  return `${configPath}.lock`
}

interface Identity {
  ino: number
  birthtimeMs: number
}

interface Observation {
  identity: Identity
  stale: boolean
}

function observe(dir: string, now: number): Observation | null {
  try {
    const stat = statSync(dir)
    return {
      identity: { ino: stat.ino, birthtimeMs: stat.birthtimeMs },
      stale: now - stat.mtimeMs > STALE_AFTER_MS,
    }
  } catch (_: unknown) {
    // Vanished between EEXIST and stat: the holder released it.
    return null
  }
}

function sameInstance(a: Identity, b: Identity): boolean {
  return a.ino === b.ino && a.birthtimeMs === b.birthtimeMs
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

type CreateOutcome = 'created' | 'exists' | { failed: string }

function tryCreate(path: string): CreateOutcome {
  try {
    mkdirSync(path)
    return 'created'
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'EEXIST' ? 'exists' : { failed: code ?? 'unknown' }
  }
}

function removeQuietly(path: string): void {
  try {
    rmdirSync(path)
  } catch (_: unknown) {
    /* already gone */
  }
}

/**
 * Take over a stale lock in place. Returns a release function when this
 * waiter now owns the directory, otherwise `null` (another waiter won, or
 * the directory is not the stale instance that was observed).
 */
function claimStale(dir: string, observed: Identity, now: () => number): (() => void) | null {
  const marker = join(dir, CLAIM)
  // A claimer that crashed leaves its marker behind; once the marker is as
  // old as a stale lock, it is nobody's and may be cleared.
  if (observe(marker, now())?.stale) removeQuietly(marker)
  if (tryCreate(marker) !== 'created') return null
  const current = observe(dir, now())
  if (current !== null && sameInstance(current.identity, observed)) {
    // Creating the marker also refreshed the directory's mtime, so other
    // waiters now see a fresh lock.
    return () => {
      removeQuietly(marker)
      removeQuietly(dir)
    }
  }
  removeQuietly(marker)
  return null
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
    if (outcome === 'created') return () => removeQuietly(dir)
    if (outcome !== 'exists') {
      // No lock directory can exist here (unwritable parent, say): there is
      // nothing to coordinate on, so proceed unlocked.
      warn(`[configLock] cannot create ${dir} (${outcome.failed}); proceeding unlocked`)
      return null
    }
    const seen = observe(dir, now())
    if (seen?.stale) {
      const release = claimStale(dir, seen.identity, now)
      if (release) return release
      // Another claimer holds the marker, or the directory was replaced:
      // fall through to the deadline and the poll like any other wait.
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
