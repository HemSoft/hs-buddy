import { describe, expect, it } from 'vitest'
import { rendererChunkFileName } from '../vite.config'
import { normalizeBundleFile, parseStaticModuleImports } from './bundle-size-utils'

describe('renderer output naming', () => {
  it('keeps root chunks and their importing shims independent of checkout names', () => {
    const names = ['hs-buddy', 'hs-buddy-audit-ZidDoy', 'issue-731-checkout-independent-bundles']
    const outputs = names.map(name => rendererChunkFileName(name, name))
    expect(outputs).toEqual(names.map(() => 'assets/app-[hash].js'))

    const shims = outputs.map(output => `import "./${output.replace('[hash]', 'AbCdEf12')}";`)
    expect(new Set(shims).size).toBe(1)
    expect(new Set(shims.map(shim => Buffer.byteLength(shim))).size).toBe(1)
    expect(parseStaticModuleImports(shims[0])).toEqual(['./assets/app-AbCdEf12.js'])
    expect(normalizeBundleFile(outputs[0].replace('[hash]', 'AbCdEf12'))).toBe('assets/app.js')
  })

  it('preserves distinct lazy route and vendor chunk names', () => {
    for (const name of ['SettingsAccounts', 'TerminalPane', 'markdown-parser', 'vendor']) {
      expect(rendererChunkFileName(name, 'hs-buddy')).toBe(`assets/${name}-[hash].js`)
    }
  })
})
