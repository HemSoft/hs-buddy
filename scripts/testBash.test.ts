import { describe, expect, it, vi } from 'vitest'
import { selectTestBash } from './testBash'

const compatible = { status: 0, stdout: 'hs-buddy-bash-compatible\n' }
const incompatible = { status: 0, stdout: '' }

describe('Windows Git Bash installations', () => {
  it.each(['ProgramFiles', 'ProgramFiles(x86)'])(
    'rejects broken WSL quoting and selects Git under %s',
    rootKey => {
      const root = rootKey === 'ProgramFiles' ? 'C:\\Program Files' : 'C:\\Program Files (x86)'
      const gitBash = `${root}\\Git\\bin\\bash.exe`
      const probe = vi.fn((executable: string) =>
        executable === gitBash ? compatible : incompatible
      )
      expect(
        selectTestBash({
          platform: 'win32',
          env: {
            [rootKey]: root,
            PATH: 'C:\\Windows\\System32',
          },
          probe,
        })
      ).toBe(gitBash)
      expect(probe.mock.calls).toEqual([['C:\\Windows\\System32\\bash.exe'], [gitBash]])
    }
  )

  it.each(['PATH', 'Path'])('uses compatible %s Bash without launching fallbacks', pathKey => {
    const gitBash = 'D:\\PortableGit\\bin\\bash.exe'
    const probe = vi.fn(() => compatible)
    expect(
      selectTestBash({
        platform: 'win32',
        env: { [pathKey]: 'D:\\PortableGit\\bin', ProgramFiles: 'C:\\Program Files' },
        probe,
      })
    ).toBe(gitBash)
    expect(probe.mock.calls).toEqual([[gitBash]])
  })

  it('finds a per-user Git installation when the WSL launcher is incompatible', () => {
    const gitBash = 'C:\\Users\\fixture\\AppData\\Local\\Programs\\Git\\bin\\bash.exe'
    const probe = vi.fn((executable: string) =>
      executable === gitBash ? compatible : incompatible
    )
    expect(
      selectTestBash({
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\Users\\fixture\\AppData\\Local', PATH: 'C:\\Windows\\System32' },
        probe,
      })
    ).toBe(gitBash)
    expect(probe.mock.calls).toEqual([['C:\\Windows\\System32\\bash.exe'], [gitBash]])
  })
})

describe('portable Bash and capability failures', () => {
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
    expect(probe.mock.calls).toEqual([['C:\\Windows\\System32\\bash.exe'], [gitBash]])
  })

  it.each(['linux', 'darwin'] as const)('retains verified PATH Bash on %s', platform => {
    const probe = vi.fn(() => compatible)
    expect(selectTestBash({ platform, env: {}, probe })).toBe('bash')
    expect(probe.mock.calls).toEqual([['bash']])
  })

  it('fails explicitly on unsuccessful exits, timeouts, or incompatible output', () => {
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
    expect(probe.mock.calls).toEqual([['C:\\Program Files\\Git\\bin\\bash.exe']])
  })
})
