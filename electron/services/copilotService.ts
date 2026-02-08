/**
 * Copilot SDK Service — Manages CopilotClient lifecycle and prompt execution.
 *
 * Uses `@github/copilot-sdk` which communicates with the local Copilot CLI
 * via JSON-RPC. Authentication is handled by existing `gh auth` — no tokens needed.
 *
 * Runs in the Electron main process.
 *
 * IMPORTANT: The SDK's `getBundledCliPath()` finds the `.js` CLI entry and spawns it
 * with `process.execPath`. In Electron, `process.execPath` is the Electron binary —
 * NOT Node.js — so the CLI would be loaded by Electron and hang/crash.
 *
 * Fix: We explicitly resolve the **native binary** (`copilot-win32-x64/copilot.exe`)
 * and pass it as `cliPath` so the SDK spawns it directly, bypassing `process.execPath`.
 */

import { CopilotClient } from '@github/copilot-sdk'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || 'https://balanced-trout-451.convex.cloud'
const DEFAULT_MODEL = 'claude-sonnet-4.5'

/**
 * Resolve the path to the native Copilot CLI binary.
 * Avoids the SDK's default `getBundledCliPath()` which uses `process.execPath`
 * (Electron binary in our case) to spawn the .js entry point.
 */
function resolveCopilotCliPath(): string {
  const platform = process.platform === 'win32' ? 'win32' : process.platform
  const arch = process.arch
  const binaryName = platform === 'win32' ? 'copilot.exe' : 'copilot'

  // 1. Check local node_modules for native binary (preferred)
  const appRoot = process.env.APP_ROOT || path.join(__dirname, '..')
  const localNative = path.join(appRoot, 'node_modules', '@github', `copilot-${platform}-${arch}`, binaryName)
  if (existsSync(localNative)) {
    console.log(`[CopilotService] Using native CLI: ${localNative}`)
    return localNative
  }

  // 2. Fallback: global copilot command (from npm -g)
  const globalCmd = platform === 'win32' ? 'copilot.cmd' : 'copilot'
  console.log(`[CopilotService] Native binary not found at ${localNative}, falling back to PATH: ${globalCmd}`)
  return globalCmd
}

export interface CopilotPromptRequest {
  prompt: string
  category?: string       // "pr-review", "general", etc.
  metadata?: unknown      // Arbitrary metadata (e.g., PR info)
  model?: string          // Override default model
}

export interface CopilotPromptResult {
  resultId: string        // Convex document ID
  success: boolean
  error?: string
}

class CopilotService {
  private convex: ConvexHttpClient
  private activeRequests = new Map<string, AbortController>()

  constructor() {
    this.convex = new ConvexHttpClient(CONVEX_URL)
  }

  /**
   * Execute a prompt via Copilot SDK and store the result in Convex.
   *
   * 1. Optionally switches the active gh CLI account
   * 2. Creates a "pending" record in Convex
   * 3. Starts a CopilotClient session
   * 4. Sends the prompt
   * 5. Captures the response and updates Convex to "completed"
   */
  async executePrompt(request: CopilotPromptRequest): Promise<CopilotPromptResult> {
    const model = request.model ?? DEFAULT_MODEL

    // Extract ghAccount from metadata if provided
    const ghAccount = (request.metadata as { ghAccount?: string } | undefined)?.ghAccount

    // 0. Switch gh CLI account if a specific account is configured
    if (ghAccount) {
      try {
        console.log(`[CopilotService] Switching to gh CLI account: ${ghAccount}`)
        await execAsync(`gh auth switch --user ${ghAccount}`, {
          encoding: 'utf8',
          timeout: 5000,
        })
        console.log(`[CopilotService] ✓ Switched to account: ${ghAccount}`)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error(`[CopilotService] ✗ Failed to switch account to ${ghAccount}:`, errorMessage)
        // Continue anyway — the active account will be used
      }
    }

    // 1. Create pending record in Convex
    const resultId = await this.convex.mutation(api.copilotResults.create, {
      prompt: request.prompt,
      category: request.category,
      metadata: request.metadata,
    })

    const resultIdStr = resultId as unknown as string
    const abortController = new AbortController()
    this.activeRequests.set(resultIdStr, abortController)

    // Run the actual execution asynchronously (don't block IPC return)
    this.runPrompt(resultId, request.prompt, model, abortController.signal)
      .catch((err) => {
        console.error(`[CopilotService] Unhandled error for ${resultIdStr}:`, err)
      })
      .finally(() => {
        this.activeRequests.delete(resultIdStr)
      })

    return { resultId: resultIdStr, success: true }
  }

  /**
   * Internal: run the Copilot SDK session and capture output.
   */
  private async runPrompt(
    resultId: Id<"copilotResults">,
    prompt: string,
    model: string,
    signal: AbortSignal
  ): Promise<void> {
    let client: CopilotClient | null = null

    // Hard timeout — guarantees the operation cannot hang forever
    const HARD_TIMEOUT = 5 * 60_000 // 5 minutes
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Hard timeout: Copilot SDK did not respond within 5 minutes')), HARD_TIMEOUT)
    )

    try {
      // Mark as running
      console.log(`[CopilotService] Marking result ${resultId as string} as running...`)
      await this.convex.mutation(api.copilotResults.markRunning, {
        id: resultId,
        model,
      })

      if (signal.aborted) {
        throw new Error('Cancelled before starting')
      }

      // 2. Start Copilot SDK client with native CLI binary
      const cliPath = resolveCopilotCliPath()
      console.log(`[CopilotService] Creating CopilotClient with cliPath: ${cliPath}`)

      client = new CopilotClient({ cliPath })

      console.log('[CopilotService] Starting client...')
      await Promise.race([client.start(), timeoutPromise])
      console.log(`[CopilotService] Client started, state: ${client.getState()}`)

      // 3. Create session with specified model
      console.log(`[CopilotService] Creating session with model: ${model}`)
      const session = await Promise.race([
        client.createSession({ model }),
        timeoutPromise
      ])
      console.log(`[CopilotService] Session created: ${session.sessionId}`)

      if (signal.aborted) {
        await session.destroy()
        throw new Error('Cancelled after session creation')
      }

      // 4. Send the prompt and collect the response
      const fullPrompt = `${prompt}

IMPORTANT: Format your entire response as clean, well-structured Markdown. Use headings, lists, code blocks, and other Markdown formatting as appropriate.`

      console.log(`[CopilotService] Sending prompt (${fullPrompt.length} chars)...`)
      const response = await Promise.race([
        session.sendAndWait({ prompt: fullPrompt }, HARD_TIMEOUT),
        timeoutPromise
      ])
      console.log('[CopilotService] Got response from SDK')

      // 5. Extract the response text from the AssistantMessageEvent
      let resultText = ''

      if (response?.data?.content) {
        resultText = typeof response.data.content === 'string'
          ? response.data.content
          : JSON.stringify(response.data.content)
      }

      if (!resultText) {
        resultText = '*No response received from Copilot SDK.*'
      }

      // Clean up session
      console.log('[CopilotService] Destroying session...')
      await session.destroy()

      // 6. Store completed result in Convex
      console.log(`[CopilotService] Saving result to Convex (${resultText.length} chars)...`)
      await this.convex.mutation(api.copilotResults.complete, {
        id: resultId,
        result: resultText,
        model,
      })

      console.log(`[CopilotService] ✓ Completed prompt (${resultText.length} chars)`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[CopilotService] ✗ Failed:`, errorMessage)

      await this.convex.mutation(api.copilotResults.fail, {
        id: resultId,
        error: errorMessage,
      }).catch(() => {
        console.error('[CopilotService] Failed to record error in Convex')
      })
    } finally {
      // Always stop the client
      if (client) {
        try {
          console.log('[CopilotService] Stopping client...')
          await client.stop()
          console.log('[CopilotService] Client stopped')
        } catch {
          // Best effort cleanup
        }
      }
    }
  }

  /**
   * Cancel an in-progress prompt execution.
   */
  cancelPrompt(resultId: string): boolean {
    const controller = this.activeRequests.get(resultId)
    if (controller) {
      controller.abort()
      this.activeRequests.delete(resultId)
      return true
    }
    return false
  }

  /**
   * Get count of active (running) prompts.
   */
  getActiveCount(): number {
    return this.activeRequests.size
  }

  /**
   * List available models from the Copilot SDK.
   *
   * Spins up a temporary CopilotClient, calls listModels(), then stops.
   * Results include model id, display name, capabilities, and billing info.
   */
  async listModels(ghAccount?: string): Promise<Array<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }>> {
    const TIMEOUT = 30_000
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: listModels did not respond within 30 seconds')), TIMEOUT)
    )

    // Switch gh CLI account BEFORE creating the client so the new copilot
    // process inherits the correct credentials.
    if (ghAccount) {
      try {
        console.log(`[CopilotService] listModels — switching to account: ${ghAccount}`)
        await execAsync(`gh auth switch --user ${ghAccount}`, {
          encoding: 'utf8',
          timeout: 5000,
        })
        console.log(`[CopilotService] listModels — ✓ switched to ${ghAccount}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[CopilotService] listModels — ✗ failed to switch to ${ghAccount}:`, msg)
        // Continue anyway — will list models for whatever account is active
      }
    }

    let client: CopilotClient | null = null
    try {
      const cliPath = resolveCopilotCliPath()
      client = new CopilotClient({ cliPath })

      console.log('[CopilotService] listModels — starting client...')
      await Promise.race([client.start(), timeoutPromise])

      console.log('[CopilotService] listModels — fetching models...')
      const models = await Promise.race([client.listModels(), timeoutPromise])

      console.log(`[CopilotService] listModels — received ${models.length} models`)
      return models.map(m => ({
        id: m.id,
        name: m.name,
        isDisabled: m.policy?.state === 'disabled',
        billingMultiplier: m.billing?.multiplier ?? 1,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[CopilotService] listModels failed:', msg)
      throw err
    } finally {
      if (client) {
        try { await client.stop() } catch { /* best effort */ }
      }
    }
  }
}

// Singleton instance
let serviceInstance: CopilotService | null = null

export function getCopilotService(): CopilotService {
  if (!serviceInstance) {
    serviceInstance = new CopilotService()
  }
  return serviceInstance
}
