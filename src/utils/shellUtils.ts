/**
 * Shell utility helpers — pure functions extracted from electron/workers/execWorker.ts.
 */

interface ShellArgs {
  command: string
  args: string[]
}

const PS_ARGS = ['-NoProfile', '-NonInteractive', '-Command']

const SHELL_MAP: Record<string, { win: ShellArgs; unix: ShellArgs }> = {
  powershell: {
    win: { command: 'pwsh.exe', args: PS_ARGS },
    unix: { command: 'pwsh', args: PS_ARGS },
  },
  pwsh: {
    win: { command: 'pwsh.exe', args: PS_ARGS },
    unix: { command: 'pwsh', args: PS_ARGS },
  },
  powershell5: {
    win: { command: 'powershell.exe', args: PS_ARGS },
    unix: { command: 'powershell', args: PS_ARGS },
  },
  bash: {
    win: { command: 'bash', args: ['-c'] },
    unix: { command: 'bash', args: ['-c'] },
  },
  sh: {
    win: { command: 'sh', args: ['-c'] },
    unix: { command: 'sh', args: ['-c'] },
  },
  zsh: {
    win: { command: 'zsh', args: ['-c'] },
    unix: { command: 'zsh', args: ['-c'] },
  },
  cmd: {
    win: { command: 'cmd.exe', args: ['/c'] },
    unix: { command: 'cmd.exe', args: ['/c'] },
  },
}

const DEFAULT_WIN: ShellArgs = { command: 'pwsh.exe', args: PS_ARGS }
const DEFAULT_UNIX: ShellArgs = { command: 'bash', args: ['-c'] }

/** Map shell name to spawn args (platform-aware for PowerShell executables). */
export function getShellArgs(shell: string, isWin: boolean): ShellArgs {
  const entry = SHELL_MAP[shell]
  if (entry) return isWin ? entry.win : entry.unix
  return isWin ? DEFAULT_WIN : DEFAULT_UNIX
}

/** Check if the resolved shell command is PowerShell. */
export function isPowerShell(shell: string, isWin = process.platform === 'win32'): boolean {
  const { command } = getShellArgs(shell, isWin)
  return ['pwsh.exe', 'pwsh', 'powershell.exe', 'powershell'].includes(command)
}

/** Resolve the error message for a killed process. */
export function killedErrorMessage(aborted: boolean, timeout: number): string {
  return aborted ? 'Cancelled by user' : `Killed after ${timeout}ms timeout`
}

/** Resolve the error message for a non-zero exit. */
export function failureErrorMessage(stderr: string, exitCode: number | null): string {
  return stderr || `Process exited with code ${exitCode}`
}

/** Truncate text to a max size with a trailing note. */
export function truncateOutput(text: string, maxSize: number): string {
  if (text.length <= maxSize) return text
  return text.slice(0, maxSize) + `\n\n--- Output truncated (${text.length} chars total) ---`
}

// ─── Worker result builder ──────────────────────────────

/** Shape returned by buildWorkerResult — mirrors electron/workers/types.WorkerResult. */
interface WorkerResultData {
  success: boolean
  output?: string
  error?: string
  exitCode: number
  duration: number
}

/** Inputs for buildWorkerResult — pure data, no AbortSignal. */
interface WorkerCloseEvent {
  killed: boolean
  aborted: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  elapsedMs: number
  timeout: number
  maxOutputSize: number
}

/** Build a worker result from process close-event data. */
export function buildWorkerResult(ev: WorkerCloseEvent): WorkerResultData {
  const output = truncateOutput(ev.stdout.trim(), ev.maxOutputSize) || undefined
  const trimmedStderr = truncateOutput(ev.stderr.trim(), ev.maxOutputSize)
  const exitCode = ev.exitCode ?? -1

  if (ev.killed) {
    return {
      success: false,
      error: killedErrorMessage(ev.aborted, ev.timeout),
      output,
      exitCode,
      duration: ev.elapsedMs,
    }
  }

  const success = exitCode === 0
  return {
    success,
    output,
    error: success ? undefined : failureErrorMessage(trimmedStderr, exitCode),
    exitCode,
    duration: ev.elapsedMs,
  }
}

// ─── Exec config resolver ───────────────────────────────

export interface ExecConfig {
  timeout: number
  shellCmd: string
  shellArgs: string[]
  finalCommand: string
}

/**
 * Resolve the shell, timeout, and command for an exec invocation.
 * Handles ?? defaults for shell and timeout internally.
 */
export function resolveExecConfig(
  command: string,
  config: { shell?: string; timeout?: number },
  defaultTimeout: number,
  platform: string
): ExecConfig {
  const timeout = config.timeout ?? defaultTimeout
  const isWin = platform === 'win32'
  const shell = config.shell ?? (isWin ? 'powershell' : 'bash')
  const { command: shellCmd, args: shellArgs } = getShellArgs(shell, isWin)
  const finalCommand = isPowerShell(shell, isWin)
    ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`
    : command
  return { timeout, shellCmd, shellArgs, finalCommand }
}

/** Build a prompt string for a skill invocation. */
export function buildSkillPrompt(skillName: string, action?: string, params?: unknown): string {
  let prompt = `Use the "${skillName}" skill`
  if (action) prompt += ` to perform the "${action}" action`
  if (params) {
    const paramsStr = typeof params === 'string' ? params : JSON.stringify(params, null, 2)
    prompt += `\n\nParameters:\n${paramsStr}`
  }
  return prompt
}
