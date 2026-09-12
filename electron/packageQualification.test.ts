import { describe, expect, it, vi } from 'vitest'
import {
  persistPackageSmokeResult,
  qualifyPackageDependencies,
  requireMountedRenderer,
  type PackageSmokeResult,
} from './packageQualification'

function nativeModule(specifier: string): object {
  return specifier === 'node-pty' ? { spawn: vi.fn() } : { load: vi.fn() }
}

describe('packaged dependency qualification', () => {
  it('loads native bindings and verifies the matching Copilot executable', () => {
    const loadModule = vi.fn(nativeModule)
    const resolveModule = vi.fn(() => '/package/package.json')
    const verifyExecutable = vi.fn()

    expect(
      qualifyPackageDependencies('darwin', 'arm64', loadModule, resolveModule, verifyExecutable)
    ).toEqual({
      nativeModules: ['node-pty', 'koffi'],
      copilotPackage: '@github/copilot-darwin-arm64',
      copilotBinary: expect.stringMatching(/[\\/]package[\\/]copilot$/),
    })
    expect(loadModule.mock.calls).toEqual([['node-pty'], ['koffi']])
    expect(resolveModule).toHaveBeenCalledWith('@github/copilot-darwin-arm64/package.json')
    expect(verifyExecutable).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]package[\\/]copilot$/)
    )
  })

  it('fails a controlled missing-native-module fixture', () => {
    const loadModule = (specifier: string) => {
      if (specifier === 'node-pty') throw new Error('fixture: node-pty is missing')
      return nativeModule(specifier)
    }

    expect(() => qualifyPackageDependencies('linux', 'x64', loadModule, vi.fn())).toThrow(
      'fixture: node-pty is missing'
    )
  })

  it.each([
    ['node-pty', null, 'spawn'],
    ['node-pty', {}, 'spawn'],
    ['koffi', {}, 'load'],
  ])('rejects %s without its native binding', (missingDependency, invalidModule, binding) => {
    const loadModule = (specifier: string) =>
      specifier === missingDependency ? invalidModule : nativeModule(specifier)

    expect(() => qualifyPackageDependencies('linux', 'x64', loadModule, vi.fn())).toThrow(
      `${missingDependency} loaded without its ${binding} binding`
    )
  })

  it('requires the renderer to report a mounted root', () => {
    expect(requireMountedRenderer(true)).toBe(true)
    expect(() => requireMountedRenderer(false)).toThrow('Renderer did not mount into #root')
  })

  it('resolves the Windows executable with its required suffix', () => {
    expect(
      qualifyPackageDependencies(
        'win32',
        'x64',
        nativeModule,
        () => 'C:\\package\\package.json',
        vi.fn()
      ).copilotBinary
    ).toBe('C:\\package\\copilot.exe')
  })

  it('rejects an empty Copilot resolution and a missing binary', () => {
    expect(() =>
      qualifyPackageDependencies('win32', 'x64', nativeModule, () => '', vi.fn())
    ).toThrow('@github/copilot-win32-x64 resolved to an empty path')

    const missingBinary = () => {
      throw new Error('fixture: Copilot binary is missing')
    }
    expect(() =>
      qualifyPackageDependencies(
        'win32',
        'x64',
        nativeModule,
        () => 'C:\\package\\package.json',
        missingBinary
      )
    ).toThrow('fixture: Copilot binary is missing')
  })
})

describe('package smoke result persistence', () => {
  const successfulResult: PackageSmokeResult = {
    ok: true,
    platform: 'linux',
    arch: 'x64',
  }

  it('writes a successful result and exits cleanly', async () => {
    const writeResult = vi.fn(async () => undefined)
    const exit = vi.fn()

    await persistPackageSmokeResult(async () => successfulResult, writeResult, exit)

    expect(writeResult).toHaveBeenCalledWith(successfulResult)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('records qualification failures before exiting unsuccessfully', async () => {
    const writeResult = vi.fn(async () => undefined)
    const exit = vi.fn()

    await persistPackageSmokeResult(
      async () => {
        throw new Error('fixture: qualification failed')
      },
      writeResult,
      exit
    )

    expect(writeResult).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'Error: fixture: qualification failed' })
    )
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('still exits when persisting the result fails', async () => {
    const exit = vi.fn()

    await expect(
      persistPackageSmokeResult(
        async () => successfulResult,
        async () => {
          throw new Error('fixture: write failed')
        },
        exit
      )
    ).rejects.toThrow('fixture: write failed')
    expect(exit).toHaveBeenCalledWith(0)
  })
})
