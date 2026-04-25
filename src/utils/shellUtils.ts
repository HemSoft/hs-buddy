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
