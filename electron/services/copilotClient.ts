/**
 * Shared Copilot SDK Client — singleton CopilotClient with prompt helper.
 *
 * The SDK's `autoStart` and `autoRestart` keep the underlying JSON-RPC
 * server alive across calls.  Each prompt creates a lightweight session,
 * sends, and destroys — no repeated start/stop overhead.
 *
 * IMPORTANT: In Electron, `process.execPath` is the Electron binary, NOT
 * Node.js, so the SDK's default `getBundledCliPath()` would fail.  We
 * resolve the **native binary** (`copilot-win32-x64/copilot.exe`) and pass
 * it as `cliPath` to bypass this.
 */

import { CopilotClient, type AssistantMessageEvent } from '@github/copilot-sdk'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { app } from 'electron'

export const DEFAULT_MODEL = 'claude-sonnet-4.5'
const SESSION_TIMEOUT = 30_000 // 30s for session creation
const MAX_OUTPUT_SIZE = 1_024_000 // 1MB

// ── CLI path resolution ──────────────────────────────────────────────────

/**
 * Resolve the path to the native Copilot CLI binary.
 * Checks local node_modules first, falls back to global PATH.
 */
function resolveCopilotCliPath(): string {
  const binaryName = process.platform === 'win32' ? 'copilot.exe' : 'copilot'
  const pkgSubPath = path.join('@github', `copilot-${process.platform}-${process.arch}`, binaryName)

  // 1. Try require.resolve (works in dev / non-asar builds)
  try {
    const pkgJson = require.resolve('@github/copilot-win32-x64/package.json')
    const nativePath = path.join(path.dirname(pkgJson), binaryName)
    if (existsSync(nativePath)) {
      console.log(`[CopilotClient] Using native CLI (require.resolve): ${nativePath}`)
      return nativePath
    }
  } catch {
    // Fall through
  }

  // 2. Try relative to app root (works in Electron packaged builds)
  const appRoot = app?.getAppPath?.() ?? process.cwd()
  const candidates = [
    path.join(appRoot, 'node_modules', pkgSubPath),
    path.join(appRoot, '..', 'node_modules', pkgSubPath),
    path.join(process.cwd(), 'node_modules', pkgSubPath),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      console.log(`[CopilotClient] Using native CLI (filesystem): ${candidate}`)
      return candidate
    }
  }

  const fallback = process.platform === 'win32' ? 'copilot.cmd' : 'copilot'
  console.log(`[CopilotClient] Native binary not found, falling back to PATH: ${fallback}`)
  return fallback
}

// ── Singleton client ─────────────────────────────────────────────────────

let sharedClient: CopilotClient | null = null
/** Guard to prevent concurrent start() calls on the shared client. */
let startPromise: Promise<void> | null = null

/**
 * Get (or create) the singleton CopilotClient.
 *
 * Uses `autoStart: true` so the server starts lazily on first use,
 * and `autoRestart: true` so it recovers from crashes automatically.
 */
function getSharedClient(): CopilotClient {
  if (!sharedClient) {
    const cliPath = resolveCopilotCliPath()
    sharedClient = new CopilotClient({
      cliPath,
      autoStart: true,
      autoRestart: true,
    })
    console.log('[CopilotClient] Shared client created')
  }
  return sharedClient
}

/**
 * Ensure the shared client is started and connected.
 *
 * Serialises concurrent callers so only ONE start() is in-flight at a time.
 * Subsequent callers await the same promise instead of spawning a second
 * CLI server process.
 */
export async function ensureClientStarted(): Promise<CopilotClient> {
  const client = getSharedClient()
  if (client.getState() === 'connected') return client

  // If a start is already in progress, piggyback on it
  if (startPromise) {
    await startPromise
    return client
  }

  startPromise = (async () => {
    try {
      await Promise.race([
        client.start(),
        rejectAfter(SESSION_TIMEOUT, 'Timeout starting Copilot client'),
      ])
    } finally {
      startPromise = null
    }
  })()

  await startPromise
  return client
}

/**
 * Stop the shared client (call on app quit).
 */
export async function stopSharedClient(): Promise<void> {
  startPromise = null // Cancel any pending start
  if (sharedClient) {
    try {
      await sharedClient.stop()
    } catch {
      // best effort
    }
    sharedClient = null
    console.log('[CopilotClient] Shared client stopped')
  }
}

/**
 * Restart the shared client.
 *
 * After a `gh auth switch` the Copilot CLI process must be restarted so
 * it picks up credentials for the newly-active account.  This stops the
 * current singleton (if any) and nulls it out so the next `getSharedClient()`
 * call creates a fresh instance.
 */
export async function restartSharedClient(): Promise<void> {
  console.log('[CopilotClient] Restarting shared client for account switch…')
  await stopSharedClient()
  // Eagerly recreate so the next sendPrompt doesn't pay the startup cost
  getSharedClient()
}

// ── Prompt helpers ───────────────────────────────────────────────────────

/** Truncate text to a max size with a note */
export function truncateOutput(text: string, maxSize = MAX_OUTPUT_SIZE): string {
  if (text.length <= maxSize) return text
  return text.slice(0, maxSize) + `\n\n--- Output truncated (${text.length} chars total) ---`
}

/** Extract the text content from an AssistantMessageEvent */
function extractContent(response: AssistantMessageEvent | undefined): string {
  if (!response?.data?.content) return ''
  return typeof response.data.content === 'string'
    ? response.data.content
    : JSON.stringify(response.data.content)
}

interface SendPromptOptions {
  prompt: string
  model?: string
  timeout?: number // ms, for sendAndWait
  signal?: AbortSignal
  cwd?: string // working directory for the CLI process
}

/**
 * Send a prompt via the shared CopilotClient and return the response text.
 *
 * Creates a session → sends → destroys.  The client itself persists.
 */
export async function sendPrompt(options: SendPromptOptions): Promise<string> {
  const { prompt, model = DEFAULT_MODEL, timeout = 120_000, signal, cwd } = options

  // When a custom cwd is requested, spin up a temporary client scoped to
  // that directory so the Copilot agent sees the correct repo/folder context.
  // Otherwise reuse the long-lived shared client.
  const needsTempClient = !!cwd
  let tempClient: CopilotClient | null = null

  try {
    let client: CopilotClient

    if (needsTempClient) {
      const cliPath = resolveCopilotCliPath()
      tempClient = new CopilotClient({ cliPath, cwd })
      await Promise.race([
        tempClient.start(),
        rejectAfter(SESSION_TIMEOUT, 'Timeout starting Copilot client'),
      ])
      client = tempClient
    } else {
      // Use the concurrency-safe helper for the shared client
      client = await ensureClientStarted()
    }

    if (signal?.aborted) throw new Error('Cancelled before session creation')

    const session = await Promise.race([
      client.createSession({ model, onPermissionRequest: () => ({ kind: 'approved' as const }) }),
      rejectAfter(SESSION_TIMEOUT, 'Timeout creating Copilot session'),
    ])

    try {
      if (signal?.aborted) throw new Error('Cancelled after session creation')

      const response = await session.sendAndWait({ prompt }, timeout)
      return extractContent(response)
    } finally {
      await session.destroy().catch(() => {})
    }
  } finally {
    if (tempClient) {
      await tempClient.stop().catch(() => {})
    }
  }
}

// ── Chat helpers ─────────────────────────────────────────────────────

let chatAbortController: AbortController | null = null

interface ChatRequest {
  message: string
  context: string
  conversationHistory: Array<{ role: string; content: string }>
  model?: string
}

/**
 * Send a chat message with context and conversation history.
 * Creates a session, sends a prompt with system context prepended, and returns the response.
 */
export async function sendChatMessage(request: ChatRequest): Promise<string> {
  chatAbortController?.abort()
  chatAbortController = new AbortController()

  // Build the full prompt with context and conversation history
  const historyText = request.conversationHistory
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  const fullPrompt = [
    request.context,
    '',
    historyText ? `Previous conversation:\n${historyText}\n` : '',
    `User: ${request.message}`,
    '',
    'IMPORTANT: Format your response as clean, well-structured Markdown.',
  ]
    .filter(Boolean)
    .join('\n')

  return sendPrompt({
    prompt: fullPrompt,
    model: request.model,
    timeout: 120_000,
    signal: chatAbortController.signal,
  })
}

/**
 * Abort in-flight chat response.
 */
export function abortChat(): void {
  if (chatAbortController) {
    chatAbortController.abort()
    chatAbortController = null
  }
}

// ── Utilities ────────────────────────────────────────────────────────────

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
}
