import { describe, expect, it } from 'vitest'
import {
  deduplicateBundles,
  normalizeBundleFile,
  normalizeRendererEntryFile,
  parseInitialHtmlAssets,
  parseStaticCssImports,
  parseStaticModuleImports,
  resolveInitialAssetImport,
  traceInitialAssetGraph,
  type BundleEntry,
} from './bundle-size-utils'

function bundle(file: string, sizeBytes: number): BundleEntry {
  return { file, sizeBytes, sizeHuman: `${sizeBytes} B` }
}

describe('normalizeBundleFile', () => {
  it('strips Vite content hashes', () => {
    expect(normalizeBundleFile('dist/assets/wasm-BnjxR4X6.js')).toBe('dist/assets/wasm.js')
  })
})

describe('normalizeRendererEntryFile', () => {
  it('uses stable app names for root chunks produced inside worktrees', () => {
    expect(
      normalizeRendererEntryFile(
        'issue-626-lazy-load-feature-routes-DWzO9sQI.js',
        'issue-626-lazy-load-feature-routes'
      )
    ).toBe('app.js')
    expect(
      normalizeRendererEntryFile(
        'issue-626-lazy-load-feature-routes-Bi18G-If.css',
        'issue-626-lazy-load-feature-routes'
      )
    ).toBe('app.css')
    expect(normalizeRendererEntryFile('SettingsAccounts-AbCdEf12.js', 'issue-626')).toBe(
      'SettingsAccounts-AbCdEf12.js'
    )
  })
})

describe('deduplicateBundles', () => {
  it('keeps the largest asset for each normalized filename', () => {
    const bundles = deduplicateBundles([
      bundle('dist/assets/wasm-ByWQv1Qj.js', 12_000),
      bundle('dist/assets/index-AbCdEf12.js', 80_000),
      bundle('dist/assets/wasm-BnjxR4X6.js', 622_325),
    ])

    expect(bundles).toEqual([
      bundle('dist/assets/wasm.js', 622_325),
      bundle('dist/assets/index.js', 80_000),
    ])
  })

  it('produces the same result regardless of colliding asset order', () => {
    const smaller = bundle('dist/assets/wasm-ByWQv1Qj.js', 12_000)
    const larger = bundle('dist/assets/wasm-BnjxR4X6.js', 622_325)

    expect(deduplicateBundles([smaller, larger])).toEqual(deduplicateBundles([larger, smaller]))
  })
})

describe('initial renderer graph', () => {
  it('finds scripts, module preloads, and stylesheets in index.html', () => {
    const html = `
      <script type="module" src="./assets/index-abc12345.js"></script>
      <link rel="modulepreload" href="./assets/vendor-def67890.js">
      <link rel="stylesheet" href="./assets/index-fedcba98.css">
      <link rel="icon" href="./icon.svg">
    `

    expect(parseInitialHtmlAssets(html)).toEqual([
      'assets/index-abc12345.js',
      'assets/index-fedcba98.css',
      'assets/vendor-def67890.js',
    ])
  })

  it('traces static imports without pulling dynamic route chunks into startup', () => {
    const sources = new Map([
      [
        'assets/index.js',
        `import{shell}from'./shell.js';import('./settings.js');export{value}from'./shared.js'`,
      ],
      ['assets/shell.js', `import './shell.css'; export const shell = true`],
      ['assets/shared.js', 'export const value = true'],
      ['assets/shell.css', 'body { color: white }'],
    ])

    expect(parseStaticModuleImports(sources.get('assets/index.js') ?? '')).toEqual([
      './shell.js',
      './shared.js',
    ])
    expect(
      traceInitialAssetGraph(['assets/index.js'], asset => {
        const source = sources.get(asset)
        if (source === undefined) throw new Error(`missing ${asset}`)
        return source
      })
    ).toEqual(['assets/index.js', 'assets/shared.js', 'assets/shell.css', 'assets/shell.js'])
  })

  it('ignores import-like text while retaining every static module form', () => {
    const source = `
      // import './comment.js'
      const message = "import './string.js'"
      import './side-effect.js'
      import value from './value.js'
      export { shared } from './shared.js'
      import('./dynamic.js')
    `

    expect(parseStaticModuleImports(source)).toEqual([
      './side-effect.js',
      './value.js',
      './shared.js',
    ])
  })

  it('parses quoted and unquoted CSS imports while ignoring comments', () => {
    const source = `
      /* @import url('./comment.css'); */
      @import './quoted.css';
      @import url("./url-quoted.css");
      @import url(./url-unquoted.css) screen;
      @import url('./layered.css') layer(feature);
      @import './anonymous-layer.css' layer;
    `

    expect(parseStaticCssImports(source)).toEqual([
      './quoted.css',
      './url-quoted.css',
      './url-unquoted.css',
      './layered.css',
      './anonymous-layer.css',
    ])
  })

  it('resolves root-relative and sibling imports inside the renderer output', () => {
    expect(resolveInitialAssetImport('assets/app/index.js', '../vendor.js')).toBe(
      'assets/vendor.js'
    )
    expect(resolveInitialAssetImport('assets/app/index.js', '/assets/base.css?x=1')).toBe(
      'assets/base.css'
    )
  })
})
