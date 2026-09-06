import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { humanSize, type BundleEntry } from './bundle-size-utils'

export function collectElectronMainChunks(distElectronDir: string): BundleEntry[] {
  const mainPath = resolve(distElectronDir, 'main.js')

  const chunks: BundleEntry[] = []
  const pending = [mainPath]
  const visited = new Set<string>()
  const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])(\.[^"']+\.js)\1/g

  while (pending.length > 0) {
    const filePath = pending.pop()
    if (!filePath || visited.has(filePath)) continue
    visited.add(filePath)

    const sourceBytes = readFileSync(filePath)
    const size = sourceBytes.length
    chunks.push({
      file: `dist-electron/${relative(distElectronDir, filePath).replaceAll('\\', '/')}`,
      sizeBytes: size,
      sizeHuman: humanSize(size),
    })

    const source = sourceBytes.toString('utf8')
    for (const match of source.matchAll(importPattern)) {
      const importedPath = resolve(dirname(filePath), match[2])
      pending.push(importedPath)
    }
  }

  return chunks
}
