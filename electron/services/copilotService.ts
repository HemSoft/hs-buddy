/**
 * Copilot SDK Service — High-level prompt execution with Convex persistence.
 *
 * Delegates all CopilotClient lifecycle to the shared singleton in
 * `copilotClient.ts`.  This service adds:
 *   - Convex record management (create → running → completed/failed)
 *   - GitHub CLI account switching
 *   - Abort / cancel support
 *   - Model listing
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import {
  getSharedClient,
  sendPrompt,
} from './copilotClient'

const execAsync = promisify(exec)

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || 'https://balanced-trout-451.convex.cloud'
const DEFAULT_MODEL = 'claude-sonnet-4.5'
const HARD_TIMEOUT = 5 * 60_000 // 5 minutes

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
   * Internal: run the prompt via the shared CopilotClient and persist to Convex.
   */
  private async runPrompt(
    resultId: Id<"copilotResults">,
    prompt: string,
    model: string,
    signal: AbortSignal
  ): Promise<void> {
    try {
      // Mark as running
      await this.convex.mutation(api.copilotResults.markRunning, {
        id: resultId,
        model,
      })

      if (signal.aborted) throw new Error('Cancelled before starting')

      const fullPrompt = `${prompt}

IMPORTANT: Format your entire response as clean, well-structured Markdown. Use headings, lists, code blocks, and other Markdown formatting as appropriate.`

      const resultText = await sendPrompt({
        prompt: fullPrompt,
        model,
        timeout: HARD_TIMEOUT,
        signal,
      }) || '*No response received from Copilot SDK.*'

      // Store completed result in Convex
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
   * List available models from the Copilot SDK via the shared client.
   */
  async listModels(ghAccount?: string): Promise<Array<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }>> {
    // Switch gh CLI account BEFORE querying so the client inherits the
    // correct credentials.
    if (ghAccount) {
      try {
        await execAsync(`gh auth switch --user ${ghAccount}`, {
          encoding: 'utf8',
          timeout: 5000,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[CopilotService] listModels — failed to switch to ${ghAccount}:`, msg)
      }
    }

    try {
      const client = getSharedClient()

      // Ensure the client is started
      if (client.getState() !== 'connected') {
        await Promise.race([
          client.start(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout starting client for listModels')), 30_000)
          ),
        ])
      }

      const models = await Promise.race([
        client.listModels(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: listModels did not respond within 30s')), 30_000)
        ),
      ])

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
