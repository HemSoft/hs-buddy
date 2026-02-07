/**
 * Skill Worker — Executes HemSoft skills via GitHub Copilot CLI.
 *
 * Uses `copilot -p` (print mode) with a skill-referencing prompt.
 * Auth is handled by GitHub CLI (`gh auth`). No API keys needed.
 * Supports abort via AbortSignal, timeout, and configurable model.
 */

import { spawn } from 'node:child_process'
import type { Worker, WorkerResult, JobConfig } from './types'

const DEFAULT_TIMEOUT = 120_000 // 2 minutes (skill calls can be slow)
const MAX_OUTPUT_SIZE = 1_024_000 // 1MB — skill output can be verbose

/** Truncate output if it exceeds the max size */
function truncate(text: string, maxSize: number): string {
  if (text.length <= maxSize) return text
  return text.slice(0, maxSize) + `\n\n--- Output truncated (${text.length} chars total) ---`
}

/** Build the prompt string for the skill invocation */
function buildSkillPrompt(skillName: string, action?: string, params?: unknown): string {
  let prompt = `Use the "${skillName}" skill`

  if (action) {
    prompt += ` to perform the "${action}" action`
  }

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
      return {
        success: false,
        error: 'No skillName specified in job config',
        duration: Date.now() - start,
      }
    }

    const timeout = config.timeout ?? DEFAULT_TIMEOUT
    const prompt = buildSkillPrompt(config.skillName, config.action, config.params)

    const args = [
      '--prompt', prompt,
      '--allow-all',
      '--silent',
    ]

    return new Promise<WorkerResult>((resolve) => {
      let stdout = ''
      let stderr = ''
      let killed = false

      const child = spawn('copilot', args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: true, // Required on Windows to find `claude` in PATH
      })

      // Timeout handling
      const timer = setTimeout(() => {
        killed = true
        child.kill('SIGTERM')
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL')
        }, 5_000)
      }, timeout)

      // AbortSignal handling
      const onAbort = () => {
        killed = true
        child.kill('SIGTERM')
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      // Collect stdout
      child.stdout.on('data', (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT_SIZE) {
          stdout += chunk.toString()
        }
      })

      // Collect stderr
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_SIZE) {
          stderr += chunk.toString()
        }
      })

      // Handle spawn errors (e.g. copilot not found)
      child.on('error', (err) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve({
          success: false,
          error: `Spawn error: ${err.message}. Is Copilot CLI installed? (npm i -g @github/copilot)`,
          duration: Date.now() - start,
        })
      })

      // Process exit
      child.on('close', (exitCode) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)

        const trimmedStdout = truncate(stdout.trim(), MAX_OUTPUT_SIZE)
        const trimmedStderr = truncate(stderr.trim(), MAX_OUTPUT_SIZE)

        if (killed) {
          resolve({
            success: false,
            error: signal?.aborted ? 'Cancelled by user' : `Killed after ${timeout}ms timeout`,
            output: trimmedStdout || undefined,
            exitCode: exitCode ?? -1,
            duration: Date.now() - start,
          })
          return
        }

        const success = exitCode === 0
        resolve({
          success,
          output: trimmedStdout || undefined,
          error: !success ? (trimmedStderr || `Copilot CLI exited with code ${exitCode}`) : undefined,
          exitCode: exitCode ?? -1,
          duration: Date.now() - start,
        })
      })
    })
  },
}
