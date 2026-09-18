import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FORBIDDEN_PRODUCTION_SCRIPT_SOURCES = ["'unsafe-eval'", "'unsafe-inline'"] as const

export function productionScriptSources(html: string): string[] {
  const cspMeta = [...html.matchAll(/<meta\b[^>]*>/gi)].find(match =>
    /http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(match[0])
  )?.[0]
  if (!cspMeta) throw new Error('Production HTML is missing its Content-Security-Policy meta tag')

  const content = cspMeta.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1]
  if (!content)
    throw new Error('Content-Security-Policy meta tag is missing a double-quoted content value')

  const scriptDirective = content
    .split(';')
    .map(directive => directive.trim())
    .find(directive => directive.startsWith('script-src '))
  if (!scriptDirective) throw new Error('Production Content-Security-Policy is missing script-src')

  return scriptDirective.split(/\s+/).slice(1)
}

export function assertProductionCsp(html: string): void {
  const scriptSources = productionScriptSources(html)
  for (const forbidden of FORBIDDEN_PRODUCTION_SCRIPT_SOURCES) {
    if (scriptSources.includes(forbidden)) {
      throw new Error(`Production script-src must not contain ${forbidden}`)
    }
  }
  if (!scriptSources.includes("'self'")) {
    throw new Error("Production script-src must retain 'self'")
  }
}

if (import.meta.main) {
  const productionHtmlPath = resolve(process.cwd(), 'dist/index.html')
  assertProductionCsp(readFileSync(productionHtmlPath, 'utf8'))
  console.log(`Production CSP check passed: ${productionHtmlPath}`)
}
