import { describe, expect, it, vi } from 'vitest'
import { qualifyPackageDependencies } from './packageQualification'

describe('packaged dependency qualification', () => {
  it('loads native modules and resolves the matching Copilot package', () => {
    const loadModule = vi.fn()
    const resolveModule = vi.fn(() => '/package/index.js')

    expect(qualifyPackageDependencies('darwin', 'arm64', loadModule, resolveModule)).toEqual({
      nativeModules: ['node-pty', 'koffi'],
      copilotPackage: '@github/copilot-darwin-arm64',
    })
    expect(loadModule.mock.calls).toEqual([['node-pty'], ['koffi']])
    expect(resolveModule).toHaveBeenCalledWith('@github/copilot-darwin-arm64')
  })

  it('fails a controlled missing-native-module fixture', () => {
    const loadModule = (specifier: string) => {
      if (specifier === 'node-pty') throw new Error('fixture: node-pty is missing')
    }

    expect(() => qualifyPackageDependencies('linux', 'x64', loadModule, vi.fn())).toThrow(
      'fixture: node-pty is missing'
    )
  })
})
