/**
 * AI Worker — Executes LLM prompts via GitHub Copilot CLI.
 *
 * Uses `copilot -p` (print mode) for non-interactive execution.
 * Auth is handled by GitHub CLI (`gh auth`). No API keys needed.
 * Supports abort via AbortSignal and configurable model selection.
 */

import { spawn } from 'node:child_process'
import type { Worker, WorkerResult, JobConfig } from './types'

const DEFAULT_TIMEOUT = 120_000 // 2 minutes (LLM calls can be slow)
const DEFAULT_MODEL = 'claude-sonnet-4.5'
const MAX_OUTPUT_SIZE = 1_024_000 // 1MB

/** Truncate output if it exceeds the max size */
function truncate(text: string, maxSize: number): string {
  if (text.length <= maxSize) return text
  return text.slice(0, maxSize) + `\n\n--- Output truncated (${text.length} chars total) ---`
}

export const aiWorker: Worker = {
  async execute(config: JobConfig, signal?: AbortSignal): Promise<WorkerResult> {
    const start = Date.now()

    if (!config.prompt) {
      return {
        success: false,
        error: 'No prompt specified in job config',
        duration: Date.now() - start,
      }
    }

    const timeout = config.timeout ?? DEFAULT_TIMEOUT
    const model = config.model ?? DEFAULT_MODEL

    const args = [
      '--prompt', config.prompt,
      '--model', model,
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
        shell: true, // Required on Windows to find `copilot` in PATH
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
