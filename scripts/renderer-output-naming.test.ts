import { describe, expect, it } from 'vitest'
import { rendererChunkFileName } from '../vite.config'
import { normalizeBundleFile, parseStaticModuleImports } from './bundle-size-utils'

describe('renderer output naming', () => {
  it('keeps root chunks and importing shims independent of checkout names', () => {
    const names = ['hs-buddy', 'hs-buddy-audit-ZidDoy', 'TerminalPane', 'markdown-parser']
    const outputs = names.map(name => {
      const entry = `/repo/${name}/src/main.tsx`
      return rendererChunkFileName({ name, moduleIds: [entry] }, entry)
    })
    expect(outputs).toEqual(names.map(() => 'assets/app-[hash].js'))
    const shims = outputs.map(output => `import "./${output.replace('[hash]', 'AbCdEf12')}";`)
    expect(new Set(shims).size).toBe(1)
    expect(new Set(shims.map(shim => Buffer.byteLength(shim))).size).toBe(1)
    expect(parseStaticModuleImports(shims[0])).toEqual(['./assets/app-AbCdEf12.js'])
    expect(normalizeBundleFile(outputs[0].replace('[hash]', 'AbCdEf12'))).toBe('assets/app.js')
  })

  it('preserves lazy and vendor identities even when they match the checkout basename', () => {
    for (const name of ['SettingsAccounts', 'TerminalPane', 'markdown-parser', 'vendor']) {
      const chunk = { name, moduleIds: [`/repo/${name}/src/components/${name}.tsx`] }
      expect(rendererChunkFileName(chunk, `/repo/${name}/src/main.tsx`)).toBe(
        `assets/${name}-[hash].js`
      )
    }
  })

  it('matches the exact entry module across Windows and POSIX path separators', () => {
    const chunk = { name: 'arbitrary', moduleIds: ['D:\\repo\\src\\main.tsx'] }
    expect(rendererChunkFileName(chunk, 'D:/repo/src/main.tsx')).toBe('assets/app-[hash].js')
    expect(rendererChunkFileName(chunk, 'D:/other/src/main.tsx')).toBe('assets/arbitrary-[hash].js')
  })
})
