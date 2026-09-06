import { relative } from 'node:path'
import { createInstrumenter } from 'istanbul-lib-instrument'
import type { CoverageInstrumenter, InstrumenterOptions } from 'vitest/node'
import type { Plugin } from 'vite'
import { isMeasuredFile } from './crap-scope.ts'
import { withoutCoverageIgnores } from './crap-source.ts'

/** Instrument original TypeScript before Vite can collapse source-map locations. */
export function sourceCoverage(roots: string[]) {
  let options: InstrumenterOptions | undefined
  const records = new Map<
    string,
    ReturnType<ReturnType<typeof createInstrumenter>['lastFileCoverage']>
  >()
  let lastFile = ''
  let lastMap: unknown
  const plugin: Plugin = {
    name: 'crap-original-typescript-coverage',
    enforce: 'pre',
    transform(source, request) {
      const id = request.split('?')[0]
      const file = relative(process.cwd(), id).replaceAll('\\', '/')
      if (!/\.tsx?$/.test(file) || !roots.includes(file.split('/')[0]) || !isMeasuredFile(file))
        return
      if (!options) throw new Error('CRAP coverage instrumenter was not initialized')
      const instrumenter = createInstrumenter({
        ...options,
        esModules: true,
        produceSourceMap: true,
        compact: false,
        parserPlugins: ['typescript', 'jsx', 'importAttributes'],
      })
      const code = instrumenter.instrumentSync(withoutCoverageIgnores(source, id), id)
      records.set(id, instrumenter.lastFileCoverage())
      return { code, map: JSON.stringify(instrumenter.lastSourceMap()) }
    },
  }
  const instrumenter = (configured: InstrumenterOptions): CoverageInstrumenter => {
    options = configured
    return {
      instrumentSync(code, id, map) {
        lastFile = id.split('?')[0]
        if (!records.has(lastFile)) throw new Error(`Missing original instrumentation: ${lastFile}`)
        lastMap = map
        return code
      },
      lastFileCoverage() {
        return records.get(lastFile)
      },
      lastSourceMap() {
        return lastMap
      },
    }
  }
  return { plugin, instrumenter }
}
