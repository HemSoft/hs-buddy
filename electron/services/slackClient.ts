import { execSync } from 'child_process'
import { createEnvResolver } from '../../src/utils/envLookup'

const SLACK_API_BASE = 'https://slack.com/api'
const SLACK_REQUEST_TIMEOUT_MS = 15_000

const ALLOWED_SLACK_ENV_NAMES = new Set([
  'SLACK_BOT_TOKEN',
  'SLACK_RAE_BOT_USER_OAUTH_TOKEN',
  'SLACK_TOKEN',
])

const getEnv = createEnvResolver(
  process.platform,
  ALLOWED_SLACK_ENV_NAMES,
  process.env as Record<string, string | undefined>,
  cmd => execSync(cmd, { encoding: 'utf8', timeout: 5000 })
)

function getBotToken(): string {
  // Check in priority order: explicit override, then generic SLACK_TOKEN (has full scopes),
  // then Relias Assistant token (lacks users:read.email).
  // Uses createEnvResolver which checks Machine scope + process.env on Windows.
  const token =
    getEnv('SLACK_BOT_TOKEN') || getEnv('SLACK_TOKEN') || getEnv('SLACK_RAE_BOT_USER_OAUTH_TOKEN')
  if (!token) {
    throw new Error(
      'No Slack bot token found. Set SLACK_BOT_TOKEN or SLACK_TOKEN as an environment variable.'
    )
  }
  return token
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getBotToken()}`,
    'Content-Type': 'application/json; charset=utf-8',
  }
}

// --- In-memory cache: GitHub login → Slack user ID ---
const slackIdCache = new Map<string, string>()

interface SlackNudgeResult {
  success: boolean
  error?: string
}

function slackError(prefix: string, error: string | undefined): SlackNudgeResult {
  return { success: false, error: `${prefix}: ${error || 'unknown'}` }
}

class SlackHttpError extends Error {
  readonly status: number

  constructor(operation: string, status: number) {
    super(`Slack ${operation} failed with HTTP ${status}`)
    this.name = 'SlackHttpError'
    this.status = status
  }
}

function assertSlackHttpSuccess(response: Response, operation: string): void {
  if (!response.ok) {
    throw new SlackHttpError(operation, response.status)
  }
}

/**
 * Look up a Slack user by their email address.
 * Returns the Slack user ID or null if not found.
 */
async function lookupSlackUserByEmail(email: string): Promise<string | null> {
  const res = await fetch(
    `${SLACK_API_BASE}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    {
      method: 'GET',
      headers: headers(),
      signal: AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS),
    }
  )
  assertSlackHttpSuccess(res, 'users.lookupByEmail')
  const data = (await res.json()) as { ok: boolean; user?: { id: string }; error?: string }
  if (!data.ok) {
    if (data.error === 'users_not_found') return null
    throw new Error(`Slack users.lookupByEmail failed: ${data.error || 'unknown'}`)
  }
  if (!data.user) {
    throw new Error('Slack users.lookupByEmail failed: missing user')
  }
  return data.user.id
}

/**
 * Open a DM conversation with a Slack user and send a nudge message.
 */
async function sendSlackDM(slackUserId: string, message: string): Promise<SlackNudgeResult> {
  // Open or get existing DM channel
  const openRes = await fetch(`${SLACK_API_BASE}/conversations.open`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ users: slackUserId }),
    signal: AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS),
  })
  assertSlackHttpSuccess(openRes, 'conversations.open')
  const openData = (await openRes.json()) as {
    ok: boolean
    channel?: { id: string }
    error?: string
  }
  if (!openData.ok || !openData.channel) {
    return slackError('Failed to open DM', openData.error)
  }

  // Send the nudge message
  const msgRes = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      channel: openData.channel.id,
      text: message,
      unfurl_links: true,
    }),
    signal: AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS),
  })
  assertSlackHttpSuccess(msgRes, 'chat.postMessage')
  const msgData = (await msgRes.json()) as { ok: boolean; error?: string }
  if (!msgData.ok) {
    return slackError('Failed to send message', msgData.error)
  }

  return { success: true }
}

function fetchGitHubEmail(githubLogin: string): string | null {
  try {
    const result = execSync(`gh api /users/${encodeURIComponent(githubLogin)} --jq .email`, {
      encoding: 'utf8',
      timeout: 10000,
    }).trim()
    return result && result !== 'null' && result.includes('@') ? result : null
  } catch (_: unknown) {
    return null
  }
}

async function tryOrgEmailPatterns(githubLogin: string): Promise<string | null> {
  const patterns = [`${githubLogin}@relias.com`, `${githubLogin}@reliaslearning.com`]
  let transientError: unknown
  for (const candidate of patterns) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- Email guesses are tried in priority order and stop at the first Slack match.
    try {
      const slackId = await lookupSlackUserByEmail(candidate)
      if (slackId) return slackId
    } catch (error: unknown) {
      // Transient Slack failures (rate limits, server errors) should not abort the
      // remaining candidate patterns; anything permanent still surfaces.
      if (error instanceof SlackHttpError && (error.status === 429 || error.status >= 500)) {
        transientError = error
        continue
      }
      throw error
    }
  }
  // Every pattern failed transiently: surface the outage instead of masking it
  // as a lookup miss.
  if (transientError) throw transientError
  return null
}

/**
 * Resolve a GitHub login to a Slack user ID.
 * Strategy: GitHub profile email → Slack lookupByEmail.
 * Results are cached in memory.
 */
async function resolveGitHubToSlack(githubLogin: string): Promise<string | null> {
  const cached = slackIdCache.get(githubLogin.toLowerCase())
  if (cached) return cached

  const email = fetchGitHubEmail(githubLogin)

  if (!email) {
    const slackId = await tryOrgEmailPatterns(githubLogin)
    if (slackId) slackIdCache.set(githubLogin.toLowerCase(), slackId)
    return slackId
  }

  const slackId = await lookupSlackUserByEmail(email)
  if (slackId) slackIdCache.set(githubLogin.toLowerCase(), slackId)
  return slackId
}

/**
 * Send a PR nudge to a GitHub user via Slack DM.
 */
export async function nudgePRAuthor(
  githubLogin: string,
  prTitle: string,
  prUrl: string
): Promise<SlackNudgeResult> {
  // Check if token is configured
  try {
    getBotToken()
  } catch (_: unknown) {
    return {
      success: false,
      error: 'SLACK_BOT_TOKEN not configured. Set it as a system environment variable.',
    }
  }

  try {
    const slackUserId = await resolveGitHubToSlack(githubLogin)
    if (!slackUserId) {
      return {
        success: false,
        error: `Could not find Slack user for GitHub login "${githubLogin}". Their GitHub email may not match their Slack email.`,
      }
    }

    const message =
      '👋 Hey! Friendly reminder - you have a PR waiting for attention:\n\n' +
      `*<${prUrl}|${prTitle}>*` +
      "\n\nWhen you get a moment, it'd be great to take a look! 🙏"

    return await sendSlackDM(slackUserId, message)
  } catch (error: unknown) {
    return slackError('Slack request failed', error instanceof Error ? error.message : undefined)
  }
}
