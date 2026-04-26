import { describe, it, expect } from 'vitest'
import { shouldCheckWindowsMachineScope, buildPowershellEnvCommand } from './envLookup'

describe('shouldCheckWindowsMachineScope', () => {
  const allowed = new Set(['TEMPO_API_TOKEN', 'TODOIST_API_TOKEN'])

  it('returns true for win32 + allowed name', () => {
    expect(shouldCheckWindowsMachineScope('win32', 'TEMPO_API_TOKEN', allowed)).toBe(true)
  })

  it('returns false for non-windows platform', () => {
    expect(shouldCheckWindowsMachineScope('darwin', 'TEMPO_API_TOKEN', allowed)).toBe(false)
    expect(shouldCheckWindowsMachineScope('linux', 'TEMPO_API_TOKEN', allowed)).toBe(false)
  })

  it('returns false for name not in allowed set', () => {
    expect(shouldCheckWindowsMachineScope('win32', 'RANDOM_VAR', allowed)).toBe(false)
  })

  it('returns false for empty name', () => {
    expect(shouldCheckWindowsMachineScope('win32', '', allowed)).toBe(false)
  })
})

describe('buildPowershellEnvCommand', () => {
  it('builds command for a simple name', () => {
    const cmd = buildPowershellEnvCommand('TEMPO_API_TOKEN')
    expect(cmd).toBe(
      `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('TEMPO_API_TOKEN','Machine')"`
    )
  })

  it('escapes single quotes in the name', () => {
    const cmd = buildPowershellEnvCommand("FOO'BAR")
    expect(cmd).toContain("FOO''BAR")
  })

  it('handles names without special characters', () => {
    const cmd = buildPowershellEnvCommand('SIMPLE')
    expect(cmd).toContain("'SIMPLE'")
  })
})
