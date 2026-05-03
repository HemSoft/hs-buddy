import { Octokit } from '@octokit/rest'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { graphql } from '@octokit/graphql'
import type { PRConfig } from '../../types/pullRequest'

// ── Re-exports for domain modules ──────────────────────────────────────────
export { graphql }
export type { Octokit }

// ── Constants ──────────────────────────────────────────────────────────────

/** Max retries when the primary rate limit is hit. */
const PRIMARY_RATE_LIMIT_RETRIES = 3

/** Max retries when a secondary (abuse) rate limit is hit. */
const SECONDARY_RATE_LIMIT_RETRIES = 2

/** Total automatic retries for transient errors. */
const TOTAL_RETRIES = 3

/** Status codes that should never be retried. */
const DO_NOT_RETRY_CODES = [404, 429]

const DEFAULT_LABEL_COLOR = '808080'

// ── Common types ───────────────────────────────────────────────────────────

type LabelWithColor = { name?: string; color?: string | null }

export function parseLabels(
  raw: Array<string | LabelWithColor>
): Array<{ name: string; color: string }> {
  return raw.map(mapPRLabel)
}

/** Shared shape for file-level diff entries (commits and PR file changes). */
export interface DiffFile {
  filename: string
  previousFilename: string | null
  status: string
  additions: number
  deletions: number
  changes: number
  patch: string | null
  blobUrl: string | null
}

// Progress callback type
export type ProgressCallback = (progress: {
  currentAccount: number
  totalAccounts: number
  accountName: string
  org: string
  status: 'authenticating' | 'fetching' | 'done' | 'error'
  prsFound?: number
  error?: string
}) => void

export type PRCommentReactionContent =
  | 'THUMBS_UP'
  | 'THUMBS_DOWN'
  | 'LAUGH'
  | 'HOORAY'
  | 'CONFUSED'
  | 'HEART'
  | 'ROCKET'
  | 'EYES'

interface PRCommentReaction {
  content: PRCommentReactionContent
  count: number
  viewerHasReacted: boolean
}

export interface PRReviewComment {
  id: string
  author: string
  authorAvatarUrl: string | null
  body: string
  bodyHtml: string | null
  createdAt: string
  updatedAt: string
  url: string
  diffHunk: string | null
  reactions: PRCommentReaction[]
}

// ── Small helper functions ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withFileStats(file: any): {
  additions: number
  deletions: number
  changes: number
} {
  return {
    additions: file.additions || 0,
    deletions: file.deletions || 0,
    changes: file.changes || 0,
  }
}

/** Map a raw commit file entry to DiffFile. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapCommitFileToDiffFile(file: any): DiffFile {
  return {
    filename: file.filename,
    previousFilename: file.previous_filename || null,
    status: file.status || 'modified',
    ...withFileStats(file),
    patch: file.patch || null,
    blobUrl: file.blob_url || null,
  }
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ensureCallback(cb?: ProgressCallback): ProgressCallback {
  return cb ?? (() => {})
}

/** Return the first non-nullish value, or null. */
export function pickFirst<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  return a ?? b ?? null
}

/** Extract author + avatarUrl from a GitHub user object (shared by issue & PR mappers). */
export function mapUserAuthorFields(
  user:
    | {
        login?: string
        avatar_url?: string
      }
    | null
    | undefined
): {
  author: string
  authorAvatarUrl: string | null
} {
  return {
    author: user?.login || 'unknown',
    authorAvatarUrl: user?.avatar_url || null,
  }
}

/** Map a raw PR label to { name, color }. */
export function mapPRLabel(l: string | { name?: string; color?: string | null }): {
  name: string
  color: string
} {
  if (typeof l === 'string') return { name: l, color: DEFAULT_LABEL_COLOR }
  return { name: l.name || '', color: l.color || DEFAULT_LABEL_COLOR }
}

/** Resolve author login + avatarUrl from a nullable GraphQL author node. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveCommentAuthor(author: any): {
  author: string
  authorAvatarUrl: string | null
} {
  return {
    author: author?.login || 'unknown',
    authorAvatarUrl: author?.avatarUrl || null,
  }
}

/** Map a raw GraphQL comment node to PRReviewComment fields. */
export function mapReviewCommentFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any,
  mapReactions: (
    groups:
      | Array<{ content: string; viewerHasReacted: boolean; users: { totalCount: number } }>
      | null
      | undefined
  ) => PRCommentReaction[]
): PRReviewComment {
  return {
    id: c.id,
    ...resolveCommentAuthor(c.author),
    body: c.body || '',
    bodyHtml: c.bodyHTML || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    url: c.url,
    diffHunk: c.diffHunk || null,
    reactions: mapReactions(c.reactionGroups),
  }
}

/** Check if a login list contains the target (case-insensitive). */
export function includesLoginIgnoreCase(logins: string[], target: string | null): boolean {
  if (!target) return false
  const lower = target.toLowerCase()
  return logins.some(login => login.toLowerCase() === lower)
}

// ── Octokit setup and caches ───────────────────────────────────────────────

/** Octokit class with retry + throttling plugins baked in. */
const OctokitWithPlugins = Octokit.plugin(retry, throttling)

// Module-level caches (persist across calls)
const tokenCache: Map<string, string> = new Map()
const orgAvatarCache: Map<string, string | null> = new Map() // null = tried and failed

/** Test-only: reset the org avatar cache between tests. */
export function clearOrgAvatarCache(): void {
  orgAvatarCache.clear()
}

/** Clear all module-level caches (token, avatar). */
export function clearAllCaches(): void {
  tokenCache.clear()
  orgAvatarCache.clear()
}

/** Test-only: inspect the org avatar cache. */
export function getOrgAvatarCacheEntry(org: string): string | null | undefined {
  return orgAvatarCache.get(org)
}

// ── Auth infrastructure ────────────────────────────────────────────────────

/**
 * Get the currently-active GitHub CLI account.
 * Uses `gh auth status` — the active account is the one used for Copilot CLI, etc.
 */
export async function getActiveCliAccount(): Promise<string | null> {
  try {
    const output: string = await window.ipcRenderer.invoke('github:get-active-account')
    return output?.trim() || null
  } catch (_: unknown) {
    return null
  }
}

/**
 * Get GitHub CLI authentication token for a specific account.
 * Uses 'gh auth token --user <username>' to get account-specific tokens.
 */
export async function getGitHubCLIToken(username: string): Promise<string | null> {
  // Check module-level cache first (persists across calls)
  const cached = tokenCache.get(username)
  if (cached) {
    return cached
  }

  try {
    // Use window.ipcRenderer to invoke a main process handler that runs 'gh auth token --user <username>'
    const token = await window.ipcRenderer.invoke('github:get-cli-token', username)
    if (token && typeof token === 'string' && token.trim().length > 0) {
      const trimmedToken = token.trim()
      tokenCache.set(username, trimmedToken)
      return trimmedToken
    }
    console.warn(`⚠️  GitHub CLI token is empty or invalid for account '${username}'`)
    return null
  } catch (error: unknown) {
    console.error(`Failed to get GitHub CLI token for '${username}':`, error)
    return null
  }
}

/**
 * Get Octokit instance with retry and throttling for a specific account.
 * Uses GitHub CLI authentication with per-account tokens.
 */
export async function getOctokit(username: string): Promise<Octokit | null> {
  const token = await getGitHubCLIToken(username)

  if (!token) {
    console.warn(
      `⚠️  GitHub CLI authentication not available for '${username}'. Run: gh auth login`
    )
    return null
  }

  return new OctokitWithPlugins({
    auth: token,
    /* v8 ignore start -- Octokit throttle callbacks; invoked by plugin internals */
    throttle: {
      onRateLimit: (retryAfter, options, _octokit, retryCount) => {
        console.warn(`Rate limit hit for ${options.method} ${options.url}`)
        if (retryCount < PRIMARY_RATE_LIMIT_RETRIES) {
          console.info(
            `Retrying after ${retryAfter} seconds (attempt ${retryCount + 1}/${PRIMARY_RATE_LIMIT_RETRIES})`
          )
          return true
        }
        return false
      },
      onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) => {
        console.warn(`Secondary rate limit hit for ${options.method} ${options.url}`)
        if (retryCount < SECONDARY_RATE_LIMIT_RETRIES) {
          console.info(
            `Retrying after ${retryAfter} seconds (attempt ${retryCount + 1}/${SECONDARY_RATE_LIMIT_RETRIES})`
          )
          return true
        }
        return false
      },
    },
    /* v8 ignore stop */
    retry: {
      doNotRetry: DO_NOT_RETRY_CODES,
      retries: TOTAL_RETRIES,
    },
  })
}

/**
 * Return accounts ordered by best match for a target owner/org.
 * Matching org accounts are tried first, then remaining accounts.
 */
function getAccountsByOwnerPriority(
  config: PRConfig['github'],
  owner: string
): PRConfig['github']['accounts'] {
  const preferred = config.accounts.filter(account => account.org === owner)
  const fallback = config.accounts.filter(account => account.org !== owner)
  return [...preferred, ...fallback]
}

/**
 * Get an Octokit instance for a given owner/org.
 * Tries accounts matching the owner first, then falls back to any account.
 */
export async function getOctokitForOwner(
  config: PRConfig['github'],
  owner: string
): Promise<Octokit> {
  for (const account of getAccountsByOwnerPriority(config, owner)) {
    const octokit = await getOctokit(account.username)
    if (octokit) return octokit
  }
  throw new Error(`No authenticated GitHub account available for ${owner}`)
}

/**
 * Get a token for an owner (used by thread/comment methods).
 */
export async function getTokenForOwner(config: PRConfig['github'], owner: string): Promise<string> {
  for (const account of getAccountsByOwnerPriority(config, owner)) {
    const token = await getGitHubCLIToken(account.username)
    /* v8 ignore start */
    if (token) {
      /* v8 ignore stop */
      return token
    }
  }

  /* v8 ignore start -- only throws when all accounts lack tokens */
  throw new Error('No authenticated GitHub account available')
  /* v8 ignore stop */
}

/**
 * Try each account in owner-priority order until one succeeds.
 * Logs warnings on per-account failures; throws if all accounts fail
 * (unless `noAccountFallback` is provided).
 */
/* v8 ignore start -- account-iteration orchestration; requires real API */
export async function withFirstAvailableAccount<T>(
  config: PRConfig['github'],
  owner: string,
  operation: (octokit: Octokit, username: string) => Promise<T>,
  label: string,
  noAccountFallback?: T
): Promise<T> {
  let lastError: unknown
  let triedCount = 0
  for (const account of getAccountsByOwnerPriority(config, owner)) {
    const octokit = await getOctokit(account.username)
    if (!octokit) continue
    triedCount++
    try {
      return await operation(octokit, account.username)
    } catch (error: unknown) {
      lastError = error
      console.warn(`Failed to ${label} with account ${account.username}:`, error)
      continue
    }
  }
  if (noAccountFallback !== undefined) return noAccountFallback
  const message =
    triedCount > 0
      ? `Could not ${label} - all ${triedCount} account(s) failed`
      : `Could not ${label} - no authenticated account available`
  throw new Error(message, { cause: lastError })
}
/* v8 ignore stop */

/**
 * Process items in batches of a given size (default 10).
 */
export async function batchProcess<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  batchSize?: number
): Promise<void> {
  const BATCH_SIZE = 10
  const size = batchSize ?? BATCH_SIZE

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    await Promise.all(batch.map(fn))
  }
}

/**
 * Batch-fetch real names for a list of GitHub logins via GraphQL aliases.
 * Returns a Map<login, name>. Logins without a name are omitted.
 */
export async function fetchUserNames(
  config: PRConfig['github'],
  logins: string[],
  org: string
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (logins.length === 0) return names

  try {
    const token = await getTokenForOwner(config, org)
    for (let i = 0; i < logins.length; i += 50) {
      const chunk = logins.slice(i, i + 50)
      await fetchUserNameChunk(token, chunk, names)
    }
  } catch (error: unknown) {
    console.warn('[fetchUserNames] GraphQL batch name lookup failed:', error)
  }

  return names
}

/** Fetch names for a single chunk of logins and merge into the result map. */
async function fetchUserNameChunk(
  token: string,
  chunk: string[],
  names: Map<string, string>
): Promise<void> {
  // GraphQL aliases must be valid identifiers — prefix with 'u' and replace non-alnum
  const sanitize = (login: string) => 'u' + login.replace(/[^a-zA-Z0-9]/g, '_')
  const fragments = chunk
    .map(login => `${sanitize(login)}: user(login: "${login}") { login name }`)
    .join('\n')
  const query = `query { ${fragments} }`
  const result = await graphql<Record<string, { login: string; name: string | null } | null>>(
    query,
    { headers: { authorization: `token ${token}` } }
  )
  for (const data of Object.values(result)) {
    if (data?.name) names.set(data.login, data.name)
  }
}

/**
 * Resolve the avatar URL for an org or user namespace.
 * Caches results (including "not found" as null) in the module-level orgAvatarCache.
 */
export async function resolveOrgAvatar(octokit: Octokit, org: string): Promise<string | null> {
  const cached = orgAvatarCache.get(org)
  if (cached !== undefined) return cached

  try {
    const orgData = await octokit.orgs.get({ org })
    orgAvatarCache.set(org, orgData.data.avatar_url)
    return orgData.data.avatar_url
  } catch (_: unknown) {
    try {
      const userData = await octokit.users.getByUsername({ username: org })
      orgAvatarCache.set(org, userData.data.avatar_url)
      return userData.data.avatar_url
    } catch (_: unknown) {
      console.debug(`Could not fetch avatar for ${org}`)
      orgAvatarCache.set(org, null)
      return null
    }
  }
}

/**
 * Map raw GraphQL reaction groups to the internal reaction array.
 */
export function mapReactionGroups(
  groups:
    | Array<{ content: string; viewerHasReacted: boolean; users: { totalCount: number } }>
    | null
    | undefined
): PRCommentReaction[] {
  const supported: PRCommentReactionContent[] = [
    'THUMBS_UP',
    'THUMBS_DOWN',
    'LAUGH',
    'HOORAY',
    'CONFUSED',
    'HEART',
    'ROCKET',
    'EYES',
  ]
  const groupMap = new Map((groups || []).map(group => [group.content, group]))

  return supported.map(content => {
    const group = groupMap.get(content)
    return {
      content,
      count: group?.users.totalCount || 0,
      viewerHasReacted: group?.viewerHasReacted || false,
    }
  })
}

/**
 * Fetch the current rate limit for a given org.
 */
export async function getRateLimit(
  config: PRConfig['github'],
  org: string
): Promise<{ limit: number; remaining: number; reset: number; used: number }> {
  return withFirstAvailableAccount(
    config,
    org,
    async octokit => {
      const { data } = await octokit.rateLimit.get()
      const core = data.resources.core
      return { limit: core.limit, remaining: core.remaining, reset: core.reset, used: core.used }
    },
    `fetch rate limit for '${org}'`
  )
}
