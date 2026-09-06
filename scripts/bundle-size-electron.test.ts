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
  expect(() => collectElectronMainChunks(directory)).toThrow(
    'Missing dist-electron/main.js. Run a clean Electron build before bundle-size check.'
  )
})

it('fails closed when an imported chunk is missing', () => {
  writeFileSync(join(directory, 'main.js'), "export { result } from './missing.js'")
  expect(() => collectElectronMainChunks(directory)).toThrow(
    'Missing Electron chunk missing.js imported by main.js.'
  )
})

it('ignores import-like comments and strings while following real dynamic imports', () => {
  writeFileSync(
    join(directory, 'main.js'),
    `
    // import './comment.js'
    const text = "import('./string.js')";
    const template = \`export { thing } from './template.js'\`;
    import('node:fs'); import(variable); import.meta.url;
    import('./real.js');
  `
  )
  writeFileSync(join(directory, 'real.js'), 'export const result = 1;')
  expect(collectElectronMainChunks(directory).map(chunk => chunk.file)).toEqual([
    'dist-electron/main.js',
    'dist-electron/real.js',
  ])
})

it('preserves filesystem errors other than a missing file', () => {
  mkdirSync(join(directory, 'main.js'))
  expect(() => collectElectronMainChunks(directory)).toThrow(/EISDIR/)
})
