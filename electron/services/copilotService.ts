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
import {
  ensureClientStarted,
  sendPrompt,
  restartSharedClient,
  DEFAULT_MODEL,
} from './copilotClient'
import { CONVEX_URL } from '../config'
import { getErrorMessage } from '../../src/utils/errorUtils'
import { execAsync } from '../utils'
import {
  hasPRReviewMetadata,
  mapModelInfo,
  type CopilotPromptRequest,
  type PRReviewMetadata,
} from '../../src/utils/copilotPromptUtils'

const HARD_TIMEOUT = 30 * 60_000 // 30 minutes — PR reviews can be lengthy
const LIST_MODELS_TIMEOUT = 30_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listModelsWithTimeout(client: any): Promise<any[]> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error('Timeout: listModels did not respond within 30s'))
    }, LIST_MODELS_TIMEOUT)
  })

  try {
    return await Promise.race([client.listModels(), timeoutPromise])
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle)
    }
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

function shouldRetryListModels(error: Error, attempt: number, maxRetries: number): boolean {
  return error.message.includes('not connected') && attempt < maxRetries
}

interface CopilotPromptResult {
  resultId: string // Convex document ID
  success: boolean
  error?: string
}

class CopilotService {
  private convex: ConvexHttpClient
  private activeRequests = new Map<string, AbortController>()
  /** The gh CLI account the shared CopilotClient was last started with. */
  private currentGhAccount: string | undefined

  constructor() {
    this.convex = new ConvexHttpClient(CONVEX_URL)
  }

  /**
   * Extract GitHub org/owner names from URLs in the prompt text.
   * Matches patterns like github.com/org/repo or github.com/org/repo/pull/123
   */
  private extractGitHubOrgs(prompt: string): string[] {
    const urlPattern = /github\.com\/([a-zA-Z0-9_.-]+)(?:\/[a-zA-Z0-9_.-]+)?/gi
    const orgs = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = urlPattern.exec(prompt)) !== null) {
      orgs.add(match[1].toLowerCase())
    }
    return [...orgs]
  }

  /**
   * Resolve the correct GitHub CLI account for a prompt.
   *
   * 1. If an explicit ghAccount is provided, use it directly.
   * 2. Otherwise, extract GitHub org(s) from URLs in the prompt text
   *    and look up the matching account in Convex githubAccounts table.
   *
   * Returns the gh CLI username to switch to, or undefined if none found.
   */
  private async resolveAccount(
    prompt: string,
    explicitAccount?: string
  ): Promise<string | undefined> {
    if (explicitAccount) return explicitAccount

    const orgs = this.extractGitHubOrgs(prompt)
    if (orgs.length === 0) return undefined

    // Query all GitHub accounts from Convex
    try {
      const accounts = await this.convex.query(api.githubAccounts.list, {})
      for (const org of orgs) {
        const match = accounts.find(a => a.org.toLowerCase() === org)
        if (match) {
          console.log(`[CopilotService] Auto-resolved account "${match.username}" for org "${org}"`)
          return match.username
        }
      }
    } catch (err) {
      console.error('[CopilotService] Failed to query accounts for auto-resolution:', err)
    }

    return undefined
  }

  /**
   * Switch the gh CLI to the specified account and restart the SDK client.
   *
   * The Copilot SDK process caches credentials at startup.  When we switch
   * `gh auth` accounts the running process still has the OLD token, so we
   * must restart the shared CopilotClient for the new credentials to take
   * effect.  We track the current account to avoid unnecessary restarts.
   */
  private async switchAccount(ghAccount: string): Promise<void> {
    // Skip if already on the correct account
    if (this.currentGhAccount === ghAccount) {
      console.log(`[CopilotService] Already on account "${ghAccount}" — skipping switch`)
      return
    }

    try {
      console.log(`[CopilotService] Switching to gh CLI account: ${ghAccount}`)
      await execAsync(`gh auth switch --user ${ghAccount}`, {
        encoding: 'utf8',
        timeout: 5000,
      })
      console.log(`[CopilotService] ✓ Switched to account: ${ghAccount}`)

      // Restart the SDK client so it picks up the new credentials
      await restartSharedClient()
      this.currentGhAccount = ghAccount
      console.log(`[CopilotService] ✓ SDK client restarted for account: ${ghAccount}`)
    } catch (err) {
      const errorMessage = getErrorMessage(err)
      console.error(`[CopilotService] ✗ Failed to switch account to ${ghAccount}:`, errorMessage)
      // Continue anyway — the active account will be used
    }
  }

  /**
   * Execute a prompt via Copilot SDK and store the result in Convex.
   *
   * 1. Resolves the correct gh CLI account (explicit or auto-detected from prompt URLs)
   * 2. Creates a "pending" record in Convex
   * 3. Starts a CopilotClient session
   * 4. Sends the prompt
   * 5. Captures the response and updates Convex to "completed"
   */
  async executePrompt(request: CopilotPromptRequest): Promise<CopilotPromptResult> {
    const model = request.model ?? DEFAULT_MODEL
    const metadata = request.metadata as PRReviewMetadata | undefined

    // Extract explicit ghAccount from metadata
    const explicitAccount = metadata?.ghAccount

    // Resolve the correct account — auto-detect from prompt URLs if not explicit
    const ghAccount = await this.resolveAccount(request.prompt, explicitAccount)

    // Switch gh CLI account if resolved
    if (ghAccount) {
      await this.switchAccount(ghAccount)
    }

    // 1. Create pending record in Convex
    const resultId = await this.convex.mutation(api.copilotResults.create, {
      prompt: request.prompt,
      category: request.category,
      metadata: request.metadata,
    })

    if (hasPRReviewMetadata(request, metadata)) {
      await this.convex.mutation(api.prReviewRuns.create, {
        owner: metadata.org,
        repo: metadata.repo,
        prNumber: metadata.prNumber,
        prUrl: metadata.prUrl,
        prTitle: metadata.prTitle,
        resultId,
        prompt: request.prompt,
        model,
        ghAccount: metadata.ghAccount,
        reviewedHeadSha: metadata.reviewedHeadSha,
        reviewedThreadStats: metadata.reviewedThreadStats,
      })
    }

    const resultIdStr = resultId as unknown as string
    const abortController = new AbortController()
    this.activeRequests.set(resultIdStr, abortController)

    // Run the actual execution asynchronously (don't block IPC return)
    this.runPrompt(resultId, request.prompt, model, abortController.signal)
      .catch(err => {
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
    resultId: Id<'copilotResults'>,
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

      await this.convex.mutation(api.prReviewRuns.markRunningByResult, {
        resultId,
        model,
      })

      if (signal.aborted) throw new Error('Cancelled before starting')

      const fullPrompt = `${prompt}

IMPORTANT: Format your entire response as clean, well-structured Markdown. Use headings, lists, code blocks, and other Markdown formatting as appropriate.`

      const resultText =
        (await sendPrompt({
          prompt: fullPrompt,
          model,
          timeout: HARD_TIMEOUT,
          signal,
        })) || '*No response received from Copilot SDK.*'

      // Store completed result in Convex
      await this.convex.mutation(api.copilotResults.complete, {
        id: resultId,
        result: resultText,
        model,
      })

      await this.convex.mutation(api.prReviewRuns.completeByResult, {
        resultId,
        model,
      })

      console.log(`[CopilotService] ✓ Completed prompt (${resultText.length} chars)`)
    } catch (err) {
      const errorMessage = getErrorMessage(err)
      console.error(`[CopilotService] ✗ Failed:`, errorMessage)

      await this.convex
        .mutation(api.copilotResults.fail, {
          id: resultId,
          error: errorMessage,
        })
        .catch(() => {
          console.error('[CopilotService] Failed to record error in Convex')
        })

      await this.convex
        .mutation(api.prReviewRuns.failByResult, {
          resultId,
          error: errorMessage,
        })
        .catch(() => {
          console.error('[CopilotService] Failed to record PR review run failure in Convex')
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
  async listModels(
    ghAccount?: string
  ): Promise<Array<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }>> {
    if (ghAccount) {
      await this.switchAccount(ghAccount)
    }

    const MAX_RETRIES = 2
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const client = await ensureClientStarted()
        const models = await listModelsWithTimeout(client)
        return models.map(mapModelInfo)
      } catch (err) {
        lastError = toError(err)
        console.warn(
          `[CopilotService] listModels attempt ${attempt + 1} failed: ${lastError.message}`
        )

        if (shouldRetryListModels(lastError, attempt, MAX_RETRIES)) {
          console.log('[CopilotService] Restarting client for retry…')
          await restartSharedClient()
          continue
        }
      }
    }

    console.error('[CopilotService] listModels failed after retries:', lastError?.message)
    throw lastError!
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
