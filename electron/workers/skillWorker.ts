/**
 * Skill Worker — Executes HemSoft skills via the shared Copilot SDK client.
 *
 * Thin wrapper: builds a skill prompt, delegates to sendPrompt(), returns WorkerResult.
 */

import path from 'node:path'
import os from 'node:os'
import { sendPrompt, truncateOutput } from '../services/copilotClient'
import type { Worker, WorkerResult, JobConfig } from './types'

const DEFAULT_TIMEOUT = 120_000
const DEFAULT_MODEL = 'claude-sonnet-4.5'

/** Skills live under ~/.agents/skills — run the Copilot agent from there */
const SKILLS_DIR = path.join(os.homedir(), '.agents', 'skills')

/** Build the prompt string for a skill invocation */
function buildSkillPrompt(skillName: string, action?: string, params?: unknown): string {
  let prompt = `Use the "${skillName}" skill`
  if (action) prompt += ` to perform the "${action}" action`
  if (params) {
    const paramsStr = typeof params === 'string' ? params : JSON.stringify(params, null, 2)
    prompt += `\n\nParameters:\n${paramsStr}`
  }
  return prompt
}

export const skillWorker: Worker = {
  async execute(config: JobConfig, signal?: AbortSignal): Promise<WorkerResult> {
    const start = Date.now()

    if (!config.skillName) {
      return { success: false, error: 'No skillName specified in job config', duration: 0 }
    }

    try {
      const prompt = buildSkillPrompt(config.skillName, config.action, config.params)
      const output = await sendPrompt({
        prompt,
        model: config.model ?? DEFAULT_MODEL,
        timeout: config.timeout ?? DEFAULT_TIMEOUT,
        signal,
        cwd: SKILLS_DIR,
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
