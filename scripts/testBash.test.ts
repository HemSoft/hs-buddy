import { describe, expect, it, vi } from 'vitest'
import { selectTestBash } from './testBash'

const compatible = { status: 0, stdout: 'hs-buddy-bash-compatible\n' }
const incompatible = { status: 0, stdout: '' }

describe('release-test Bash selection', () => {
  it('rejects a successful Windows launcher with broken quoting and selects Git Bash', () => {
    const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe'
    const probe = vi.fn((executable: string) =>
      executable === gitBash ? compatible : incompatible
    )
    expect(
      selectTestBash({
        platform: 'win32',
        env: {
          ProgramFiles: 'C:\\Program Files',
          PATH: 'C:\\Windows\\System32;C:\\Program Files\\Git\\bin',
        },
        probe,
      })
    ).toBe(gitBash)
    expect(probe.mock.calls).toEqual([['bash'], [gitBash]])
  })

  it('uses compatible PATH Bash without launching fallback executables', () => {
    const probe = vi.fn(() => compatible)
    expect(
      selectTestBash({ platform: 'win32', env: { ProgramFiles: 'C:\\Program Files' }, probe })
    ).toBe('bash')
    expect(probe.mock.calls).toEqual([['bash']])
  })

  it('finds a per-user Git installation when the WSL launcher is incompatible', () => {
    const gitBash = 'C:\\Users\\fixture\\AppData\\Local\\Programs\\Git\\bin\\bash.exe'
    const probe = vi.fn((executable: string) =>
      executable === gitBash ? compatible : incompatible
    )
    expect(
      selectTestBash({
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\Users\\fixture\\AppData\\Local' },
        probe,
      })
    ).toBe(gitBash)
    expect(probe.mock.calls).toEqual([['bash'], [gitBash]])
  })

  it('finds a nonstandard Git Bash location on PATH after missing standard installs', () => {
    const gitBash = 'D:\\Tools\\PortableGit\\bin\\bash.exe'
    const probe = vi.fn((executable: string) =>
      executable === gitBash
        ? compatible
        : { status: null, stdout: null, error: new Error('ENOENT') }
    )
    expect(
      selectTestBash({
        platform: 'win32',
        env: { PATH: 'C:\\Windows\\System32;D:\\Tools\\PortableGit\\bin' },
        probe,
      })
    ).toBe(gitBash)
    expect(probe.mock.calls).toEqual([['bash'], ['C:\\Windows\\System32\\bash.exe'], [gitBash]])
  })

  it.each(['linux', 'darwin'] as const)('retains verified PATH Bash on %s', platform => {
    const probe = vi.fn(() => compatible)
    expect(selectTestBash({ platform, env: {}, probe })).toBe('bash')
    expect(probe.mock.calls).toEqual([['bash']])
  })

  it('fails explicitly when the capability probe exits unsuccessfully or times out', () => {
    for (const result of [
      { status: 1, stdout: compatible.stdout },
      { status: null, stdout: compatible.stdout, error: new Error('ETIMEDOUT') },
      incompatible,
    ]) {
      expect(() => selectTestBash({ platform: 'linux', env: {}, probe: () => result })).toThrow(
        'install Bash on PATH'
      )
    }
  })

  it('deduplicates Windows executable paths case-insensitively before failing', () => {
    const probe = vi.fn(() => incompatible)
    expect(() =>
      selectTestBash({
        platform: 'win32',
        env: {
          ProgramFiles: 'C:\\Program Files',
          PATH: 'C:\\Program Files\\Git\\bin;c:\\program files\\git\\bin',
        },
        probe,
      })
    ).toThrow('install Git for Windows')
    expect(probe.mock.calls).toEqual([['bash'], ['C:\\Program Files\\Git\\bin\\bash.exe']])
  })
})
