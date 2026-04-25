/**
 * Exec Worker — Executes shell commands (PowerShell, Bash, cmd).
 *
 * Uses spawn() (not exec()) to handle large output without buffer overflow.
 * Supports configurable shell, working directory, and timeout.
 */

import { spawn } from 'node:child_process'
import { truncateOutput } from '../services/copilotClient'
import type { Worker, WorkerResult, JobConfig } from './types'
import {
  getShellArgs,
  isPowerShell,
  killedErrorMessage,
  failureErrorMessage,
} from '../../src/utils/shellUtils'

const DEFAULT_TIMEOUT = 30_000 // 30 seconds
const MAX_OUTPUT_SIZE = 512_000 // 512KB per stream

/** Build the WorkerResult from the close event data */
function buildWorkerResult(opts: {
  killed: boolean
  signal?: AbortSignal
  exitCode: number | null
  stdout: string
  stderr: string
  now: number
  start: number
  timeout: number
}): WorkerResult {
  const output = truncateOutput(opts.stdout.trim(), MAX_OUTPUT_SIZE) || undefined
  const trimmedStderr = truncateOutput(opts.stderr.trim(), MAX_OUTPUT_SIZE)
  const duration = opts.now - opts.start
  const exitCode = opts.exitCode ?? -1

  if (opts.killed) {
    return {
      success: false,
      error: killedErrorMessage(!!opts.signal?.aborted, opts.timeout),
      output,
      exitCode,
      duration,
    }
  }

  const success = exitCode === 0
  return {
    success,
    output,
    error: success ? undefined : failureErrorMessage(trimmedStderr, opts.exitCode),
    exitCode,
    duration,
  }
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
    const isWin = process.platform === 'win32'
    const defaultShell = isWin ? 'powershell' : 'bash'
    const shell = config.shell ?? defaultShell
    const { command: shellCmd, args: shellArgs } = getShellArgs(shell, isWin)

    // For PowerShell, ensure console output encoding is UTF-8
    const finalCommand = isPowerShell(shell)
      ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${config.command!}`
      : config.command!

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
            signal,
            exitCode,
            stdout,
            stderr,
            now: Date.now(),
            start,
            timeout,
          })
        )
      })
    })
  },
}
