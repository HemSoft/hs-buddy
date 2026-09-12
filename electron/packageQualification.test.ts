import { describe, expect, it, vi } from 'vitest'
import { qualifyPackageDependencies, requireMountedRenderer } from './packageQualification'

function nativeModule(specifier: string): object {
  return specifier === 'node-pty' ? { spawn: vi.fn() } : { load: vi.fn() }
}

describe('packaged dependency qualification', () => {
  it('loads native bindings and verifies the matching Copilot executable', () => {
    const loadModule = vi.fn(nativeModule)
    const resolveModule = vi.fn(() => '/package/index.js')
    const verifyExecutable = vi.fn()

    expect(
      qualifyPackageDependencies('darwin', 'arm64', loadModule, resolveModule, verifyExecutable)
    ).toEqual({
      nativeModules: ['node-pty', 'koffi'],
      copilotPackage: '@github/copilot-darwin-arm64',
      copilotBinary: expect.stringMatching(/[\\/]package[\\/]copilot$/),
    })
    expect(loadModule.mock.calls).toEqual([['node-pty'], ['koffi']])
    expect(resolveModule).toHaveBeenCalledWith('@github/copilot-darwin-arm64')
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
        () => 'C:\\package\\index.js',
        missingBinary
      )
    ).toThrow('fixture: Copilot binary is missing')
  })
})
