import { describe, expect, it } from 'vitest'
import { deduplicateBundles, normalizeBundleFile, type BundleEntry } from './bundle-size-utils'

function bundle(file: string, sizeBytes: number): BundleEntry {
  return { file, sizeBytes, sizeHuman: `${sizeBytes} B` }
}

describe('normalizeBundleFile', () => {
  it('strips Vite content hashes', () => {
    expect(normalizeBundleFile('dist/assets/wasm-BnjxR4X6.js')).toBe('dist/assets/wasm.js')
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
