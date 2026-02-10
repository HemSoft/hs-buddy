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

const DEFAULT_MODEL = 'claude-sonnet-4.5'
const SESSION_TIMEOUT = 30_000  // 30s for session creation
const MAX_OUTPUT_SIZE = 1_024_000 // 1MB

// ── CLI path resolution ──────────────────────────────────────────────────

/**
 * Resolve the path to the native Copilot CLI binary.
 * Checks local node_modules first, falls back to global PATH.
 */
export function resolveCopilotCliPath(): string {
  const platform = process.platform === 'win32' ? 'win32' : process.platform
  const arch = process.arch
  const binaryName = platform === 'win32' ? 'copilot.exe' : 'copilot'

  const appRoot = process.env.APP_ROOT || path.join(__dirname, '..')
  const localNative = path.join(
    appRoot, 'node_modules', '@github',
    `copilot-${platform}-${arch}`, binaryName
  )

  if (existsSync(localNative)) {
    console.log(`[CopilotClient] Using native CLI: ${localNative}`)
    return localNative
  }

  const fallback = platform === 'win32' ? 'copilot.cmd' : 'copilot'
  console.log(`[CopilotClient] Native binary not found, falling back to PATH: ${fallback}`)
  return fallback
}

// ── Singleton client ─────────────────────────────────────────────────────

let sharedClient: CopilotClient | null = null

/**
 * Get (or create) the singleton CopilotClient.
 *
 * Uses `autoStart: true` so the server starts lazily on first use,
 * and `autoRestart: true` so it recovers from crashes automatically.
 */
export function getSharedClient(): CopilotClient {
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
 * Stop the shared client (call on app quit).
 */
export async function stopSharedClient(): Promise<void> {
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

// ── Prompt helpers ───────────────────────────────────────────────────────

/** Truncate text to a max size with a note */
export function truncateOutput(text: string, maxSize = MAX_OUTPUT_SIZE): string {
  if (text.length <= maxSize) return text
  return text.slice(0, maxSize) + `\n\n--- Output truncated (${text.length} chars total) ---`
}

/** Extract the text content from an AssistantMessageEvent */
export function extractContent(response: AssistantMessageEvent | undefined): string {
  if (!response?.data?.content) return ''
  return typeof response.data.content === 'string'
    ? response.data.content
    : JSON.stringify(response.data.content)
}

export interface SendPromptOptions {
  prompt: string
  model?: string
  timeout?: number       // ms, for sendAndWait
  signal?: AbortSignal
  cwd?: string            // working directory for the CLI process
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
      client = getSharedClient()
      if (client.getState() !== 'connected') {
        await Promise.race([
          client.start(),
          rejectAfter(SESSION_TIMEOUT, 'Timeout starting Copilot client'),
        ])
      }
    }

    if (signal?.aborted) throw new Error('Cancelled before session creation')

    const session = await Promise.race([
      client.createSession({ model }),
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

// ── Utilities ────────────────────────────────────────────────────────────

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
}
