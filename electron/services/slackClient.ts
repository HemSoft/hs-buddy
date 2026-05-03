import { execSync } from 'child_process'
import { createEnvResolver } from '../../src/utils/envLookup'

const SLACK_API_BASE = 'https://slack.com/api'

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
    getEnv('SLACK_BOT_TOKEN') ||
    getEnv('SLACK_TOKEN') ||
    getEnv('SLACK_RAE_BOT_USER_OAUTH_TOKEN') ||
    // Direct process.env fallback in case Machine-scope PowerShell lookup fails
    process.env.SLACK_BOT_TOKEN ||
    process.env.SLACK_TOKEN ||
    process.env.SLACK_RAE_BOT_USER_OAUTH_TOKEN
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
    }
  )
  const data = (await res.json()) as { ok: boolean; user?: { id: string }; error?: string }
  if (!data.ok || !data.user) return null
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
  })
  const openData = (await openRes.json()) as {
    ok: boolean
    channel?: { id: string }
    error?: string
  }
  if (!openData.ok || !openData.channel) {
    return { success: false, error: `Failed to open DM: ${openData.error || 'unknown'}` }
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
  })
  const msgData = (await msgRes.json()) as { ok: boolean; error?: string }
  if (!msgData.ok) {
    return { success: false, error: `Failed to send message: ${msgData.error || 'unknown'}` }
  }

  return { success: true }
}

/**
 * Resolve a GitHub login to a Slack user ID.
 * Strategy: GitHub profile email → Slack lookupByEmail.
 * Results are cached in memory.
 */
async function resolveGitHubToSlack(githubLogin: string): Promise<string | null> {
  // Check cache first
  const cached = slackIdCache.get(githubLogin.toLowerCase())
  if (cached) return cached

  // Get email from GitHub profile via gh CLI
  let email: string | null = null
  try {
    const result = execSync(`gh api /users/${encodeURIComponent(githubLogin)} --jq .email`, {
      encoding: 'utf8',
      timeout: 10000,
    }).trim()
    if (result && result !== 'null' && result.includes('@')) {
      email = result
    }
  } catch (_: unknown) {
    // gh CLI not available or user not found
  }

  // If no public email, try the org-specific email pattern
  // Many orgs use firstname.lastname@company.com — but we can't infer that reliably
  // For Relias, the pattern is typically the GitHub username + @relias.com or @reliaslearning.com
  if (!email) {
    // Try common corporate patterns
    const patterns = [`${githubLogin}@relias.com`, `${githubLogin}@reliaslearning.com`]
    for (const candidate of patterns) {
      const slackId = await lookupSlackUserByEmail(candidate)
      if (slackId) {
        slackIdCache.set(githubLogin.toLowerCase(), slackId)
        return slackId
      }
    }
    return null
  }

  // Resolve email to Slack user
  const slackId = await lookupSlackUserByEmail(email)
  if (slackId) {
    slackIdCache.set(githubLogin.toLowerCase(), slackId)
  }
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

  return sendSlackDM(slackUserId, message)
}
