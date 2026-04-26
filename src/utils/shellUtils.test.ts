import { describe, it, expect, beforeEach } from 'vitest'
import {
  getShellArgs,
  isPowerShell,
  killedErrorMessage,
  failureErrorMessage,
  buildSkillPrompt,
  truncateOutput,
  buildWorkerResult,
} from './shellUtils'

describe('getShellArgs', () => {
  it('returns pwsh.exe for powershell on Windows', () => {
    const result = getShellArgs('powershell', true)
    expect(result.command).toBe('pwsh.exe')
    expect(result.args).toContain('-NoProfile')
  })

  it('returns pwsh for powershell on Unix', () => {
    const result = getShellArgs('powershell', false)
    expect(result.command).toBe('pwsh')
  })

  it('returns bash for bash on both platforms', () => {
    expect(getShellArgs('bash', true).command).toBe('bash')
    expect(getShellArgs('bash', false).command).toBe('bash')
    expect(getShellArgs('bash', false).args).toEqual(['-c'])
  })

  it('returns zsh for zsh', () => {
    expect(getShellArgs('zsh', false).command).toBe('zsh')
    expect(getShellArgs('zsh', false).args).toEqual(['-c'])
  })

  it('returns cmd.exe for cmd', () => {
    expect(getShellArgs('cmd', true).command).toBe('cmd.exe')
    expect(getShellArgs('cmd', true).args).toEqual(['/c'])
  })

  it('falls back to pwsh.exe on Windows for unknown shell', () => {
    const result = getShellArgs('unknown', true)
    expect(result.command).toBe('pwsh.exe')
  })

  it('falls back to bash on Unix for unknown shell', () => {
    const result = getShellArgs('unknown', false)
    expect(result.command).toBe('bash')
    expect(result.args).toEqual(['-c'])
  })

  it('handles powershell5 variant', () => {
    expect(getShellArgs('powershell5', true).command).toBe('powershell.exe')
    expect(getShellArgs('powershell5', false).command).toBe('powershell')
  })

  it('handles pwsh variant', () => {
    expect(getShellArgs('pwsh', true).command).toBe('pwsh.exe')
    expect(getShellArgs('pwsh', false).command).toBe('pwsh')
  })

  it('handles sh', () => {
    expect(getShellArgs('sh', false).command).toBe('sh')
    expect(getShellArgs('sh', false).args).toEqual(['-c'])
  })
})

describe('isPowerShell', () => {
  it('returns false for bash, sh, zsh, cmd', () => {
    expect(isPowerShell('bash')).toBe(false)
    expect(isPowerShell('sh')).toBe(false)
    expect(isPowerShell('zsh')).toBe(false)
    expect(isPowerShell('cmd')).toBe(false)
  })

  it('returns true for powershell variants', () => {
    expect(isPowerShell('powershell')).toBe(true)
    expect(isPowerShell('pwsh')).toBe(true)
    expect(isPowerShell('powershell5')).toBe(true)
  })

  it('returns false for unknown shell on Unix (falls back to bash)', () => {
    expect(isPowerShell('fish', false)).toBe(false)
  })

  it('returns true for unknown shell on Windows (falls back to pwsh)', () => {
    expect(isPowerShell('fish', true)).toBe(true)
  })
})

describe('killedErrorMessage', () => {
  it('returns abort message when aborted', () => {
    expect(killedErrorMessage(true, 30000)).toBe('Cancelled by user')
  })

  it('returns timeout message when not aborted', () => {
    expect(killedErrorMessage(false, 30000)).toBe('Killed after 30000ms timeout')
  })
})

describe('failureErrorMessage', () => {
  it('returns stderr when available', () => {
    expect(failureErrorMessage('permission denied', 1)).toBe('permission denied')
  })

  it('returns exit code message when no stderr', () => {
    expect(failureErrorMessage('', 127)).toBe('Process exited with code 127')
  })

  it('handles null exit code', () => {
    expect(failureErrorMessage('', null)).toBe('Process exited with code null')
  })
})

describe('buildSkillPrompt', () => {
  it('builds basic skill prompt', () => {
    expect(buildSkillPrompt('deploy')).toBe('Use the "deploy" skill')
  })

  it('includes action when provided', () => {
    expect(buildSkillPrompt('deploy', 'rollback')).toBe(
      'Use the "deploy" skill to perform the "rollback" action'
    )
  })

  it('includes string params', () => {
    const result = buildSkillPrompt('deploy', undefined, 'my-params')
    expect(result).toContain('Parameters:\nmy-params')
  })

  it('serializes object params as JSON', () => {
    const result = buildSkillPrompt('deploy', 'run', { env: 'prod' })
    expect(result).toContain('"env": "prod"')
  })

  it('includes action and params together', () => {
    const result = buildSkillPrompt('test', 'run', { suite: 'unit' })
    expect(result).toContain('to perform the "run" action')
    expect(result).toContain('"suite": "unit"')
  })
})

describe('truncateOutput', () => {
  it('returns text unchanged when under limit', () => {
    expect(truncateOutput('hello', 100)).toBe('hello')
  })

  it('returns text unchanged when exactly at limit', () => {
    const text = 'a'.repeat(50)
    expect(truncateOutput(text, 50)).toBe(text)
  })

  it('truncates text over limit with note', () => {
    const text = 'a'.repeat(200)
    const result = truncateOutput(text, 100)
    expect(result).toContain('a'.repeat(100))
    expect(result).toContain('--- Output truncated (200 chars total) ---')
  })

  it('handles empty string', () => {
    expect(truncateOutput('', 100)).toBe('')
  })
})

describe('buildWorkerResult', () => {
  const base = {
    killed: false,
    aborted: false,
    exitCode: 0 as number | null,
    stdout: 'output text',
    stderr: '',
    elapsedMs: 150,
    timeout: 30000,
    maxOutputSize: 512_000,
  }

  it('returns success for exit code 0', () => {
    const result = buildWorkerResult(base)
    expect(result.success).toBe(true)
    expect(result.output).toBe('output text')
    expect(result.error).toBeUndefined()
    expect(result.exitCode).toBe(0)
    expect(result.duration).toBe(150)
  })

  it('returns failure for non-zero exit code', () => {
    const result = buildWorkerResult({ ...base, exitCode: 1, stderr: 'error msg' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('error msg')
    expect(result.exitCode).toBe(1)
  })

  it('uses exit code message when stderr is empty', () => {
    const result = buildWorkerResult({ ...base, exitCode: 127 })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Process exited with code 127')
  })

  it('returns timeout message when killed without abort', () => {
    const result = buildWorkerResult({ ...base, killed: true, aborted: false })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Killed after 30000ms timeout')
  })

  it('returns abort message when killed with abort', () => {
    const result = buildWorkerResult({ ...base, killed: true, aborted: true })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Cancelled by user')
  })

  it('defaults null exit code to -1', () => {
    const result = buildWorkerResult({ ...base, exitCode: null })
    expect(result.exitCode).toBe(-1)
  })

  it('uses normalized exit code in error message when exitCode is null', () => {
    const result = buildWorkerResult({ ...base, exitCode: null, stderr: '' })
    expect(result.error).toBe('Process exited with code -1')
  })

  it('trims stdout and stderr', () => {
    const result = buildWorkerResult({
      ...base,
      stdout: '  trimmed  ',
      stderr: '  err  ',
      exitCode: 1,
    })
    expect(result.output).toBe('trimmed')
    expect(result.error).toBe('err')
  })

  it('sets output to undefined for empty stdout', () => {
    const result = buildWorkerResult({ ...base, stdout: '' })
    expect(result.output).toBeUndefined()
  })

  it('truncates large stdout', () => {
    const bigOutput = 'x'.repeat(200)
    const result = buildWorkerResult({ ...base, stdout: bigOutput, maxOutputSize: 50 })
    expect(result.output).toContain('--- Output truncated')
  })
})

describe('resolveExecConfig', () => {
  let resolveExecConfig: typeof import('./shellUtils').resolveExecConfig

  beforeEach(async () => {
    ;({ resolveExecConfig } = await import('./shellUtils'))
  })

  it('uses bash on non-Windows when no shell specified', () => {
    const cfg = resolveExecConfig('echo hi', {}, 30_000, 'darwin')
    expect(cfg.shellCmd).toBe('bash')
    expect(cfg.shellArgs).toEqual(['-c'])
    expect(cfg.finalCommand).toBe('echo hi')
  })

  it('uses powershell on Windows when no shell specified', () => {
    const cfg = resolveExecConfig('dir', {}, 30_000, 'win32')
    expect(cfg.shellCmd).toBe('pwsh.exe')
    expect(cfg.finalCommand).toContain('[Console]::OutputEncoding')
    expect(cfg.finalCommand).toContain('dir')
  })

  it('uses default timeout when not specified', () => {
    const cfg = resolveExecConfig('ls', {}, 30_000, 'linux')
    expect(cfg.timeout).toBe(30_000)
  })

  it('uses custom timeout when specified', () => {
    const cfg = resolveExecConfig('ls', { timeout: 5000 }, 30_000, 'linux')
    expect(cfg.timeout).toBe(5000)
  })

  it('uses custom shell when specified', () => {
    const cfg = resolveExecConfig('echo hi', { shell: 'zsh' }, 30_000, 'darwin')
    expect(cfg.shellCmd).toBe('zsh')
    expect(cfg.shellArgs).toEqual(['-c'])
    expect(cfg.finalCommand).toBe('echo hi')
  })

  it('wraps command for PowerShell shell', () => {
    const cfg = resolveExecConfig('Get-Process', { shell: 'pwsh' }, 30_000, 'linux')
    expect(cfg.shellCmd).toBe('pwsh')
    expect(cfg.finalCommand).toContain('[Console]::OutputEncoding')
    expect(cfg.finalCommand).toContain('Get-Process')
  })

  it('does not wrap bash commands with PowerShell prefix', () => {
    const cfg = resolveExecConfig('ls -la', { shell: 'bash' }, 30_000, 'linux')
    expect(cfg.finalCommand).toBe('ls -la')
  })
})
