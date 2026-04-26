/**
 * Exec Worker — Executes shell commands (PowerShell, Bash, cmd).
 *
 * Uses spawn() (not exec()) to handle large output without buffer overflow.
 * Supports configurable shell, working directory, and timeout.
 */

import { spawn } from 'node:child_process'
import type { Worker, WorkerResult, JobConfig } from './types'
import { resolveExecConfig, buildWorkerResult } from '../../src/utils/shellUtils'

const DEFAULT_TIMEOUT = 30_000 // 30 seconds
const MAX_OUTPUT_SIZE = 512_000 // 512KB per stream

export const execWorker: Worker = {
  async execute(config: JobConfig, signal?: AbortSignal): Promise<WorkerResult> {
    const start = Date.now()

    if (!config.command) {
      return {
        success: false,
        error: 'No command specified in job config',
        duration: Date.now() - start,
      }
    }

    const { timeout, shellCmd, shellArgs, finalCommand } = resolveExecConfig(
      config.command,
      { shell: config.shell, timeout: config.timeout },
      DEFAULT_TIMEOUT,
      process.platform
    )

    return new Promise<WorkerResult>(resolve => {
      let stdout = ''
      let stderr = ''
      let killed = false

      const child = spawn(shellCmd, [...shellArgs, finalCommand], {
        cwd: config.cwd || undefined,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      // Timeout handling
      const timer = setTimeout(() => {
        killed = true
        child.kill('SIGTERM')
        // Force kill after 5s if still alive
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
          stdout += chunk.toString('utf8')
        }
      })

      // Collect stderr
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_SIZE) {
          stderr += chunk.toString('utf8')
        }
      })

      // Handle errors (e.g. command not found)
      child.on('error', err => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve({
          success: false,
          error: `Spawn error: ${err.message}`,
          duration: Date.now() - start,
        })
      })

      // Process exit
      child.on('close', exitCode => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(
          buildWorkerResult({
            killed,
            aborted: !!signal?.aborted,
            exitCode,
            stdout,
            stderr,
            elapsedMs: Date.now() - start,
            timeout,
            maxOutputSize: MAX_OUTPUT_SIZE,
          })
        )
      })
    })
  },
}
