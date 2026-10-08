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
 *   back to waiting. A marker that is itself stale belongs to a claimer that
 *   crashed too; it is never removed, it is claimed the same way one level
 *   down (`claim/claim`), so no waiter ever deletes or renames anything it
 *   does not own and a live lock or claim cannot be stolen;
 * - ownership: an owner writes a unique token into the level it owns
 *   (`owner`), and a holder re-checks right before writing that its token
 *   is still there and no claim is nested inside (a process suspended longer
 *   than the stale window has lost it), re-acquiring if not; the native side
 *   also keeps its size+mtime stamp check, so a stolen lock cannot lose a
 *   write;
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
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * A holder that has not touched its lock for this long is presumed dead. Long
 * enough that a process suspended for a while keeps its lock; short enough
 * that a crashed holder costs writers only a brief spell of unlocked writes.
 */
export const STALE_AFTER_MS = 30_000
/** How long a writer waits for the lock before proceeding unlocked. */
const DEFAULT_TIMEOUT_MS = 1_000
const POLL_MS = 10
const CLAIM = 'claim'
/** The owner's token file inside the level it owns. */
const OWNER = 'owner'

export function lockDirFor(configPath: string): string {
  return `${configPath}.lock`
}

interface Identity {
  ino: number
  birthtimeMs: number
}

interface Observation {
  identity: Identity
  mtimeMs: number
  stale: boolean
}

function observe(dir: string, now: number): Observation | null {
  try {
    const stat = statSync(dir)
    return {
      identity: { ino: stat.ino, birthtimeMs: stat.birthtimeMs },
      mtimeMs: stat.mtimeMs,
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

function readOwner(level: string): string | null {
  try {
    return readFileSync(join(level, OWNER), 'utf8')
  } catch (_: unknown) {
    return null
  }
}

function newToken(): string {
  return `${process.pid}-${process.hrtime.bigint()}-${randomBytes(6).toString('hex')}`
}

/** Mark `level` as owned by this handle; returns the token, or null if it cannot be written. */
function takeOwnership(level: string): string | null {
  const token = newToken()
  try {
    writeFileSync(join(level, OWNER), token, { flag: 'wx' })
    return token
  } catch (_: unknown) {
    return null
  }
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

/**
 * The config directory may not exist yet (first launch, or deleted while the
 * app runs); the stores create it before writing, so the lock must too.
 */
function createParent(dir: string): boolean {
  try {
    mkdirSync(dirname(dir), { recursive: true })
    return true
  } catch (_: unknown) {
    return false
  }
}

/** Once per acquisition, a missing config directory is created and retried. */
function recoverMissingParent(
  outcome: { failed: string },
  dir: string,
  recovery: { parentCreated: boolean }
): boolean {
  if (outcome.failed !== 'ENOENT' || recovery.parentCreated) return false
  recovery.parentCreated = true
  return createParent(dir)
}

function removeQuietly(path: string): void {
  try {
    rmdirSync(path)
  } catch (_: unknown) {
    /* already gone */
  }
}

/** Consecutive crashed claimers nest one level each; deeper than this, wait. */
const MAX_CLAIM_DEPTH = 8

type LevelOutcome = 'owned' | 'held' | 'retry' | 'descend'

/** One level of the takeover: claim `level` or decide what to do next. */
function claimLevel(level: string, now: () => number): LevelOutcome {
  const seen = observe(level, now())
  if (seen === null) return 'retry'
  if (!seen.stale) return 'held'
  const seenOwner = readOwner(level)
  const outcome = tryCreate(join(level, CLAIM))
  // A marker exists: fresh means a live claimer is ahead; stale means it
  // belongs to a crashed one and is claimed one level down.
  if (outcome === 'exists') return 'descend'
  if (outcome !== 'created') return 'held'
  // Creating the marker refreshed the level's mtime, so other waiters now
  // see it fresh; keep it only if the level is still the instance observed:
  // same inode and birth time, and the same owner token (a released and
  // recreated level carries a different token, or none yet).
  const current = observe(level, now())
  if (
    current !== null &&
    sameInstance(current.identity, seen.identity) &&
    readOwner(level) === seenOwner
  ) {
    return 'owned'
  }
  removeQuietly(join(level, CLAIM))
  return current === null ? 'retry' : 'held'
}

/** The holder's view of its lock. */
export interface ConfigLockHandle {
  release: () => void
  /** Whether the lock is still the instance this holder created or claimed. */
  held: () => boolean
}

function handleFor(chain: string[]): ConfigLockHandle {
  const owned = chain[chain.length - 1]
  const token = takeOwnership(owned)
  const held = (): boolean =>
    token !== null && !existsSync(join(owned, CLAIM)) && readOwner(owned) === token
  return {
    // Never remove a lock that is no longer ours (taken over while this
    // process was suspended): that would strip the new holder's lock.
    release: () => {
      if (token === null || held()) releaseChain(chain)
    },
    held,
  }
}

/**
 * Take over a stale lock in place. Returns a handle when this waiter now
 * owns the chain, `null` when a live holder or claimer is ahead (or the
 * directory is not the stale instance observed), and `'retry'` when a level
 * vanished underneath (its owner released it).
 */
function claimStale(dir: string, now: () => number): ConfigLockHandle | null | 'retry' {
  const chain = [dir]
  for (let depth = 0; depth < MAX_CLAIM_DEPTH; depth += 1) {
    const level = chain[chain.length - 1]
    const outcome = claimLevel(level, now)
    if (outcome === 'owned') {
      chain.push(join(level, CLAIM))
      return handleFor(chain)
    }
    if (outcome === 'retry') return 'retry'
    if (outcome === 'held') return null
    chain.push(join(level, CLAIM))
  }
  // Every level down to the limit is a stale marker of a crashed claimer and
  // nobody alive owns any of it: drop the deepest one so the chain can be
  // claimed again instead of wedging every later writer.
  const deepest = chain[chain.length - 1]
  if (observe(deepest, now())?.stale) rmSync(deepest, { recursive: true, force: true })
  return 'retry'
}

/**
 * Remove the chain deepest first: the owned level's token file and
 * directory, then each dead claimer's level above it (its token file and
 * directory). Stop at the first level that is not empty, which means a
 * later claimer nested below it after this lock went stale.
 */
function releaseChain(chain: string[]): void {
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    try {
      unlinkSync(join(chain[i], OWNER))
    } catch (_: unknown) {
      /* no token at this level */
    }
    try {
      rmdirSync(chain[i])
    } catch (_: unknown) {
      return
    }
  }
}

export interface LockOptions {
  timeoutMs?: number
  /**
   * What to do when the lock turns out to have been taken over during the
   * callback: `'repeat'` runs the callback once more under a fresh lock
   * (only for an idempotent write such as a single `store.set`); the default
   * `'warn'` just reports it, since a transaction may not be replayable.
   */
  onLostDuringWrite?: 'repeat' | 'warn'
  /** Injectable wall clock (for mtime comparisons) for tests. */
  now?: () => number
  /** Injectable monotonic clock (for the deadline) for tests. */
  monotonic?: () => number
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => void
  warn?: (message: string) => void
}

interface ResolvedOptions {
  timeoutMs: number
  now: () => number
  monotonic: () => number
  sleep: (ms: number) => void
  warn: (message: string) => void
}

function resolveOptions(options: LockOptions): ResolvedOptions {
  return {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    now: options.now ?? Date.now,
    monotonic: options.monotonic ?? (() => performance.now()),
    sleep: options.sleep ?? sleepSync,
    warn:
      options.warn ??
      (() => {
        /* silent by default; ConfigManager logs */
      }),
  }
}

/**
 * Acquire the lock for `configPath`. Returns a handle, or `null` when the
 * wait ran out and the caller should proceed unlocked.
 */
export function acquireConfigLock(
  configPath: string,
  options: LockOptions = {}
): ConfigLockHandle | null {
  const { timeoutMs, now, monotonic, sleep, warn } = resolveOptions(options)
  const dir = lockDirFor(configPath)
  // The deadline is measured on a monotonic clock: a wall clock stepping
  // backwards must not extend the wait.
  const deadline = monotonic() + timeoutMs
  const recovery = { parentCreated: false }
  for (;;) {
    const outcome = tryCreate(dir)
    if (outcome === 'created') return handleFor([dir])
    if (outcome !== 'exists') {
      if (recoverMissingParent(outcome, dir, recovery)) continue
      // Anything else (unwritable parent, say) means there is nothing to
      // coordinate on: proceed unlocked.
      warn(`[configLock] cannot create ${dir} (${outcome.failed}); proceeding unlocked`)
      return null
    }
    const claimed = claimStale(dir, now)
    if (claimed !== null && claimed !== 'retry') return claimed
    // Held by a live holder or claimer, or not observable at all (a dangling
    // symlink at the lock path, say): wait like for any other lock, so the
    // deadline always applies.
    if (monotonic() >= deadline) {
      warn(`[configLock] ${dir} busy for ${timeoutMs}ms; proceeding unlocked`)
      return null
    }
    sleep(POLL_MS)
  }
}

/**
 * Run `fn` while holding the config lock (or unlocked after the timeout).
 * If the lock was lost between acquisition and the write (this process was
 * suspended past the stale window), it is acquired again first. If it was
 * lost during the write itself, another writer may have landed in between
 * and been overwritten: an idempotent write (`onLostDuringWrite: 'repeat'`)
 * is repeated once under a fresh lock so it re-applies on top of whatever
 * landed; anything else is reported, because a transaction such as adding
 * an account cannot be replayed safely.
 */
/** Acquire, and acquire again if the lock was lost while waiting. */
function acquireHeld(configPath: string, options: LockOptions): ConfigLockHandle | null {
  const handle = acquireConfigLock(configPath, options)
  if (handle === null || handle.held()) return handle
  options.warn?.(
    `[configLock] ${lockDirFor(configPath)} was taken over while waiting; re-acquiring`
  )
  handle.release()
  return acquireConfigLock(configPath, options)
}

/** Run `fn` under `handle` (or unlocked); report whether the lock survived. */
function runHeld<T>(handle: ConfigLockHandle | null, fn: () => T): { result: T; kept: boolean } {
  try {
    const result = fn()
    return { result, kept: handle === null || handle.held() }
  } finally {
    handle?.release()
  }
}

export function withConfigLock<T>(configPath: string, fn: () => T, options: LockOptions = {}): T {
  const first = runHeld(acquireHeld(configPath, options), fn)
  if (first.kept) return first.result
  const dir = lockDirFor(configPath)
  if (options.onLostDuringWrite !== 'repeat') {
    options.warn?.(
      `[configLock] ${dir} was taken over during the write; a concurrent change may have been overwritten`
    )
    return first.result
  }
  options.warn?.(`[configLock] ${dir} was taken over during the write; repeating it`)
  return runHeld(acquireConfigLock(configPath, options), fn).result
}
