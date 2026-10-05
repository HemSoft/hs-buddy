import { describe, expect, it, vi } from 'vitest'
import { selectTestBash } from './testBash'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
  lstatSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const compatible = { status: 0, stdout: 'hs-buddy-bash-compatible\n' }
const incompatible = { status: 0, stdout: '' }

function cleanFixture(directory: string): void {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name)
    const child = relative(directory, file)
    if (isAbsolute(child) || child.startsWith(`..${sep}`) || !lstatSync(file).isFile())
      throw new Error('Unexpected cleanup fixture path')
    unlinkSync(file)
  }
  rmdirSync(directory)
}

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
      expect(probe.mock.calls).toEqual([
        ['C:\\Windows\\System32\\bash.exe', 5000],
        [gitBash, 5000],
      ])
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
    expect(probe.mock.calls).toEqual([[gitBash, 5000]])
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
    expect(probe.mock.calls).toEqual([
      ['C:\\Windows\\System32\\bash.exe', 5000],
      [gitBash, 5000],
    ])
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
    expect(probe.mock.calls).toEqual([
      ['C:\\Windows\\System32\\bash.exe', 5000],
      [gitBash, 5000],
    ])
  })

  it.each(['linux', 'darwin'] as const)('retains verified PATH Bash on %s', platform => {
    const probe = vi.fn(() => compatible)
    expect(selectTestBash({ platform, env: {}, probe })).toBe('bash')
    expect(probe.mock.calls).toEqual([['bash', 5000]])
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
    expect(probe.mock.calls).toEqual([['C:\\Program Files\\Git\\bin\\bash.exe', 5000]])
  })
})

describe('shared Bash discovery deadline', () => {
  it('stops after three full timeouts instead of starting another candidate', () => {
    let elapsed = 0
    const probe = vi.fn((_executable: string, timeoutMs: number) => {
      elapsed += timeoutMs
      return incompatible
    })
    expect(() =>
      selectTestBash({
        platform: 'win32',
        env: { PATH: 'C:\\one;C:\\two;C:\\three;C:\\four' },
        probe,
        now: () => elapsed,
      })
    ).toThrow('shared 15-second budget')
    expect(probe.mock.calls).toEqual([
      ['C:\\one\\bash.exe', 5000],
      ['C:\\two\\bash.exe', 5000],
      ['C:\\three\\bash.exe', 5000],
    ])
  })

  it('clamps the final timeout to the remaining budget and rejects late success', () => {
    let elapsed = 0
    const probe = vi.fn((_executable: string, _timeoutMs: number) => {
      elapsed = elapsed === 0 ? 14_000 : 15_001
      return elapsed === 14_000 ? incompatible : compatible
    })
    expect(() =>
      selectTestBash({
        platform: 'win32',
        env: { PATH: 'C:\\one;C:\\two;C:\\three' },
        probe,
        now: () => elapsed,
      })
    ).toThrow('shared 15-second budget')
    expect(probe.mock.calls).toEqual([
      ['C:\\one\\bash.exe', 5000],
      ['C:\\two\\bash.exe', 1000],
    ])
  })
})

describe('native Bash cleanup capabilities', { timeout: 25_000 }, () => {
  it.each([
    ['failure', 1],
    ['missing', 127],
    ['no-op', 0],
  ])('rejects %s removal even when quoting and reads succeed', (_name, status) => {
    const directory = mkdtempSync(join(tmpdir(), 'buddy-bash-cleanup-'))
    const startup = join(directory, 'fault.sh')
    const moduleUrl = pathToFileURL(resolve('scripts/testBash.ts')).href
    const source = `import { selectTestBash } from ${JSON.stringify(moduleUrl)};
try { console.log(JSON.stringify({selected: true, executable: selectTestBash()})); }
catch (error) { console.log(JSON.stringify({selected: false, message: error.message})); }`
    let failure: { error: unknown } | undefined
    try {
      writeFileSync(startup, `rm() { return ${status}; }\n`)
      const result = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--input-type=module', '-e', source],
        {
          encoding: 'utf8',
          timeout: 20_000,
          killSignal: 'SIGKILL',
          env: {
            ...process.env,
            BASH_ENV: startup.replaceAll('\\', '/'),
            TMPDIR: directory.replaceAll('\\', '/'),
          },
        }
      )
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({
        selected: false,
        message: expect.stringContaining('supports mktemp, cat and rm'),
      })
      const counters = readdirSync(directory).filter(name => name !== 'fault.sh')
      expect(counters.length).toBeGreaterThan(0)
      for (const name of counters)
        expect(readFileSync(join(directory, name), 'utf8')).toBe('buddy "quoted" $literal')
    } catch (error: unknown) {
      failure = { error }
    }
    try {
      cleanFixture(directory)
    } catch (error: unknown) {
      if (failure)
        console.error('Bash cleanup fixture cleanup failed after a primary test failure.')
      else failure = { error }
    }
    if (failure) throw failure.error
  })
})
