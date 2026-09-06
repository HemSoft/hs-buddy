import { readFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { initSync, parse } from 'es-module-lexer'
import { humanSize, type BundleEntry } from './bundle-size-utils'

initSync()

interface PendingChunk {
  path: string
  importer?: string
}

function readChunk(chunk: PendingChunk): Buffer {
  try {
    return readFileSync(chunk.path)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const message = chunk.importer
      ? `Missing Electron chunk ${basename(chunk.path)} imported by ${basename(chunk.importer)}.`
      : 'Missing dist-electron/main.js. Run a clean Electron build before bundle-size check.'
    throw new Error(message, { cause: error })
  }
}

export function collectElectronMainChunks(distElectronDir: string): BundleEntry[] {
  const mainPath = resolve(distElectronDir, 'main.js')

  const chunks: BundleEntry[] = []
  const pending: PendingChunk[] = [{ path: mainPath }]
  const visited = new Set<string>()

  while (pending.length > 0) {
    const chunk = pending.pop()
    if (!chunk || visited.has(chunk.path)) continue
    const filePath = chunk.path
    visited.add(filePath)

    const sourceBytes = readChunk(chunk)
    const size = sourceBytes.length
    chunks.push({
      file: `dist-electron/${relative(distElectronDir, filePath).replaceAll('\\', '/')}`,
      sizeBytes: size,
      sizeHuman: humanSize(size),
    })

    const source = sourceBytes.toString('utf8')
    const [imports] = parse(source)
    for (const { n: specifier } of imports) {
      if (!specifier?.startsWith('.') || !specifier.endsWith('.js')) continue
      pending.push({ path: resolve(dirname(filePath), specifier), importer: filePath })
    }
  }

  return chunks
}
