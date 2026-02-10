/**
 * AI Worker — Executes LLM prompts via the shared Copilot SDK client.
 *
 * Thin wrapper: validates config, delegates to sendPrompt(), returns WorkerResult.
 */

import { sendPrompt, truncateOutput } from '../services/copilotClient'
import type { Worker, WorkerResult, JobConfig } from './types'

const DEFAULT_TIMEOUT = 120_000
const DEFAULT_MODEL = 'claude-sonnet-4.5'

export const aiWorker: Worker = {
  async execute(config: JobConfig, signal?: AbortSignal): Promise<WorkerResult> {
    const start = Date.now()

    if (!config.prompt) {
      return { success: false, error: 'No prompt specified in job config', duration: 0 }
    }

    try {
      const output = await sendPrompt({
        prompt: config.prompt,
        model: config.model ?? DEFAULT_MODEL,
        timeout: config.timeout ?? DEFAULT_TIMEOUT,
        signal,
      })

      return {
        success: true,
        output: truncateOutput(output) || undefined,
        exitCode: 0,
        duration: Date.now() - start,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
      }
    }
  },
}
