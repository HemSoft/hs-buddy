import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { collectElectronMainChunks } from './bundle-size-electron'

let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'buddy-bundle-test-'))
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

it('measures the bytes it parses and follows nested imports once', () => {
  const main = "import './chunks/child.js'; import('./chunks/child.js'); // café"
  const child = "import '../main.js'; export const result = '🌞';"
  mkdirSync(join(directory, 'chunks'))
  writeFileSync(join(directory, 'main.js'), main)
  writeFileSync(join(directory, 'chunks/child.js'), child)
  expect(collectElectronMainChunks(directory)).toEqual([
    {
      file: 'dist-electron/main.js',
      sizeBytes: Buffer.byteLength(main),
      sizeHuman: `${Buffer.byteLength(main)} B`,
    },
    {
      file: 'dist-electron/chunks/child.js',
      sizeBytes: Buffer.byteLength(child),
      sizeHuman: `${Buffer.byteLength(child)} B`,
    },
  ])
})

it('fails closed when the main bundle is missing', () => {
  expect(() => collectElectronMainChunks(directory)).toThrow(/ENOENT/)
})

it('fails closed when an imported chunk is missing', () => {
  writeFileSync(join(directory, 'main.js'), "export { result } from './missing.js'")
  expect(() => collectElectronMainChunks(directory)).toThrow(/ENOENT/)
})
