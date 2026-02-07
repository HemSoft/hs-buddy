/**
 * Exec Worker — Executes shell commands (PowerShell, Bash, cmd).
 *
 * Uses spawn() (not exec()) to handle large output without buffer overflow.
 * Supports configurable shell, working directory, and timeout.
 */

import { spawn } from 'node:child_process'
import type { Worker, WorkerResult, JobConfig } from './types'

const DEFAULT_TIMEOUT = 30_000 // 30 seconds
const MAX_OUTPUT_SIZE = 512_000 // 512KB per stream

/** Map shell name to spawn args */
function getShellArgs(shell: string): { command: string; args: string[] } {
  switch (shell) {
    case 'powershell':
      return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command'] }
    case 'bash':
      return { command: 'bash', args: ['-c'] }
    case 'cmd':
      return { command: 'cmd.exe', args: ['/c'] }
    default:
      // Default to PowerShell on Windows
      return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command'] }
  }
}

/** Truncate output if it exceeds the max size */
function truncate(text: string, maxSize: number): string {
  if (text.length <= maxSize) return text
  return text.slice(0, maxSize) + `\n\n--- Output truncated (${text.length} chars total) ---`
}

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

    const timeout = config.timeout ?? DEFAULT_TIMEOUT
    const shell = config.shell ?? 'powershell'
    const { command: shellCmd, args: shellArgs } = getShellArgs(shell)

    return new Promise<WorkerResult>((resolve) => {
      let stdout = ''
      let stderr = ''
      let killed = false

      const child = spawn(shellCmd, [...shellArgs, config.command!], {
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
          stdout += chunk.toString()
        }
      })

      // Collect stderr
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_SIZE) {
          stderr += chunk.toString()
        }
      })

      // Handle errors (e.g. command not found)
      child.on('error', (err) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve({
          success: false,
          error: `Spawn error: ${err.message}`,
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
          error: !success ? (trimmedStderr || `Process exited with code ${exitCode}`) : undefined,
          exitCode: exitCode ?? -1,
          duration: Date.now() - start,
        })
      })
    })
  },
}
