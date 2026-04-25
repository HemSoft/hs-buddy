import { describe, it, expect } from 'vitest'
import {
  getShellArgs,
  isPowerShell,
  killedErrorMessage,
  failureErrorMessage,
  buildSkillPrompt,
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
