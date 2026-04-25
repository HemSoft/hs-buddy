/**
 * Exec Worker — Executes shell commands (PowerShell, Bash, cmd).
 *
 * Uses spawn() (not exec()) to handle large output without buffer overflow.
 * Supports configurable shell, working directory, and timeout.
 */

import { spawn } from 'node:child_process'
import { truncateOutput } from '../services/copilotClient'
import type { Worker, WorkerResult, JobConfig } from './types'

const DEFAULT_TIMEOUT = 30_000 // 30 seconds
const MAX_OUTPUT_SIZE = 512_000 // 512KB per stream

/** Map shell name to spawn args (platform-aware for PowerShell executables) */
function getShellArgs(shell: string): { command: string; args: string[] } {
  const isWin = process.platform === 'win32'
  const PS_ARGS = ['-NoProfile', '-NonInteractive', '-Command']

  const shellMap: Record<string, { command: string; args: string[] }> = {
    powershell: { command: isWin ? 'pwsh.exe' : 'pwsh', args: PS_ARGS },
    pwsh: { command: isWin ? 'pwsh.exe' : 'pwsh', args: PS_ARGS },
    powershell5: { command: isWin ? 'powershell.exe' : 'powershell', args: PS_ARGS },
    bash: { command: 'bash', args: ['-c'] },
    sh: { command: 'sh', args: ['-c'] },
    zsh: { command: 'zsh', args: ['-c'] },
    cmd: { command: 'cmd.exe', args: ['/c'] },
  }

  // Platform-aware default: PowerShell on Windows, bash elsewhere
  return (
    shellMap[shell] ??
    (isWin ? { command: 'pwsh.exe', args: PS_ARGS } : { command: 'bash', args: ['-c'] })
  )
}

/** Check if a shell type is PowerShell (any shell that isn't bash, sh, zsh, or cmd) */
function isPowerShell(shell: string): boolean {
  return !['bash', 'sh', 'zsh', 'cmd'].includes(shell)
}

/** Resolve the error message for a killed process. */
function killedErrorMessage(signal: AbortSignal | undefined, timeout: number): string {
  return signal?.aborted ? 'Cancelled by user' : `Killed after ${timeout}ms timeout`
}

/** Resolve the error message for a non-zero exit. */
function failureErrorMessage(stderr: string, exitCode: number | null): string {
  return stderr || `Process exited with code ${exitCode}`
}

/** Build the WorkerResult from the close event data */
function buildWorkerResult(opts: {
  killed: boolean
  signal?: AbortSignal
  exitCode: number | null
  stdout: string
  stderr: string
  start: number
  timeout: number
}): WorkerResult {
  const output = truncateOutput(opts.stdout.trim(), MAX_OUTPUT_SIZE) || undefined
  const trimmedStderr = truncateOutput(opts.stderr.trim(), MAX_OUTPUT_SIZE)
  const duration = Date.now() - opts.start
  const exitCode = opts.exitCode ?? -1

  if (opts.killed) {
    return {
      success: false,
      error: killedErrorMessage(opts.signal, opts.timeout),
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
    const defaultShell = process.platform === 'win32' ? 'powershell' : 'bash'
    const shell = config.shell ?? defaultShell
    const { command: shellCmd, args: shellArgs } = getShellArgs(shell)

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
        resolve(buildWorkerResult({ killed, signal, exitCode, stdout, stderr, start, timeout }))
      })
    })
  },
}
