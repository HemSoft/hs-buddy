import { describe, expect, it } from 'vitest'
import { hardenProductionCsp, PRODUCTION_SCRIPT_SRC } from '../vite.config'
import { assertProductionCsp, productionScriptSources } from './check-production-csp'

const developmentHtml = `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';">`

describe('production CSP', () => {
  it('removes development-only script allowances during a production transform', () => {
    const productionHtml = hardenProductionCsp(developmentHtml)

    expect(productionHtml).toContain(PRODUCTION_SCRIPT_SRC)
    expect(productionScriptSources(productionHtml)).toEqual(["'self'", "'wasm-unsafe-eval'"])
    expect(() => assertProductionCsp(productionHtml)).not.toThrow()
  })

  it('fails closed when the expected development directive changes', () => {
    expect(() => hardenProductionCsp('<html></html>')).toThrow(
      'Expected one development script-src directive'
    )
  })

  it.each(["'unsafe-eval'", "'unsafe-inline'"])('rejects %s in production script-src', source => {
    const html = developmentHtml.replace(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      `script-src 'self' ${source}`
    )

    expect(() => assertProductionCsp(html)).toThrow(
      `Production script-src must not contain ${source}`
    )
  })

  it('keeps only the narrow WebAssembly exception needed by Shiki', () => {
    const productionHtml = hardenProductionCsp(developmentHtml)

    expect(() => assertProductionCsp(productionHtml)).not.toThrow()
    expect(productionHtml).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(productionHtml).toContain("style-src 'self' 'unsafe-inline'")
  })

  it('rejects production HTML that cannot compile Shiki WebAssembly', () => {
    const productionHtml = hardenProductionCsp(developmentHtml).replace(" 'wasm-unsafe-eval'", '')

    expect(() => assertProductionCsp(productionHtml)).toThrow(
      "Production script-src must retain 'wasm-unsafe-eval'"
    )
  })
})
