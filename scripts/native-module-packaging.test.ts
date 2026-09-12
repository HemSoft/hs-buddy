import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { electronNativeExternals } from '../vite.config'

interface PackageManifest {
  dependencies?: Record<string, string>
}

const packageManifest = JSON.parse(readFileSync('package.json', 'utf8')) as PackageManifest
const builderConfig = readFileSync('electron-builder.json5', 'utf8')

const nativeModules = [
  {
    dependency: 'node-pty',
    unpackPattern: 'node_modules/node-pty/**/*',
  },
  {
    dependency: 'koffi',
    unpackPattern: 'node_modules/@koromix/koffi-*/**/*',
  },
] as const

describe('Electron native module packaging', () => {
  it.each(nativeModules)(
    'keeps $dependency external, resolvable, and unpacked',
    ({ dependency, unpackPattern }) => {
      expect(electronNativeExternals).toContain(dependency)
      expect(packageManifest.dependencies).toHaveProperty(dependency)
      expect(builderConfig).toMatch(new RegExp(`["']${unpackPattern.replaceAll('*', '\\*')}["']`))
    }
  )
})
