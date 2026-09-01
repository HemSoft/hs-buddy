export interface BundleEntry {
  file: string
  sizeBytes: number
  sizeHuman: string
}

function stripQueryAndHash(asset: string): string {
  return asset.split(/[?#]/, 1)[0]
}

function normalizePathSegments(path: string): string {
  const segments: string[] = []
  for (const segment of path.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

export function normalizeInitialAssetPath(asset: string): string | null {
  const clean = stripQueryAndHash(asset.trim())
  if (!clean || clean.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(clean)) return null
  return normalizePathSegments(clean)
}

export function parseInitialHtmlAssets(html: string): string[] {
  const assets = new Set<string>()

  for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = match[0]
    const tagName = match[1].toLowerCase()
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1].toLowerCase() ?? ''
    const attribute = tagName === 'script' ? 'src' : 'href'
    const value = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1]
    const shouldInclude =
      tagName === 'script' ||
      rel.split(/\s+/).some(token => token === 'modulepreload' || token === 'stylesheet')

    if (!value || !shouldInclude) continue
    const normalized = normalizeInitialAssetPath(value)
    if (normalized) assets.add(normalized)
  }

  return [...assets].sort()
}

export function parseStaticModuleImports(source: string): string[] {
  const imports = new Set<string>()
  const fromPattern = /\b(?:import|export)\s*(?!\s*\()[^"'();]*?\bfrom\s*(["'])([^"']+)\1/g
  const sideEffectPattern = /\bimport\s*(?!\s*\()(["'])([^"']+)\1/g

  for (const pattern of [fromPattern, sideEffectPattern]) {
    for (const match of source.matchAll(pattern)) imports.add(match[2])
  }

  return [...imports]
}

export function parseStaticCssImports(source: string): string[] {
  return [...source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map(match => match[1])
}

export function resolveInitialAssetImport(importer: string, specifier: string): string | null {
  const normalizedSpecifier = normalizeInitialAssetPath(specifier)
  if (!normalizedSpecifier) return null
  if (specifier.startsWith('/')) return normalizedSpecifier

  const slash = importer.lastIndexOf('/')
  const directory = slash >= 0 ? importer.slice(0, slash + 1) : ''
  return normalizePathSegments(`${directory}${stripQueryAndHash(specifier)}`)
}

export function traceInitialAssetGraph(
  initialAssets: readonly string[],
  readAsset: (asset: string) => string
): string[] {
  const pending = initialAssets
    .map(asset => normalizeInitialAssetPath(asset))
    .filter(Boolean) as string[]
  const visited = new Set<string>()

  while (pending.length > 0) {
    const asset = pending.pop()
    if (!asset || visited.has(asset)) continue
    visited.add(asset)

    const source = readAsset(asset)
    const imports = asset.endsWith('.js')
      ? parseStaticModuleImports(source)
      : asset.endsWith('.css')
        ? parseStaticCssImports(source)
        : []

    for (const specifier of imports) {
      const resolved = resolveInitialAssetImport(asset, specifier)
      if (resolved && !visited.has(resolved)) pending.push(resolved)
    }
  }

  return [...visited].sort()
}

// Normalize filenames by stripping Vite content hashes: index-DBd6EIt0.js → index.js
export function normalizeBundleFile(file: string): string {
  return file.replace(/-[A-Za-z0-9_-]{8}\./, '.')
}

/** Keep one deterministic entry per normalized filename, preferring the largest asset. */
export function deduplicateBundles(bundles: readonly BundleEntry[]): BundleEntry[] {
  const deduped = new Map<string, BundleEntry>()

  for (const bundle of bundles) {
    const normalizedFile = normalizeBundleFile(bundle.file)
    const existing = deduped.get(normalizedFile)
    if (!existing || bundle.sizeBytes > existing.sizeBytes) {
      deduped.set(normalizedFile, { ...bundle, file: normalizedFile })
    }
  }

  return [...deduped.values()].sort(
    (a, b) => b.sizeBytes - a.sizeBytes || a.file.localeCompare(b.file)
  )
}
