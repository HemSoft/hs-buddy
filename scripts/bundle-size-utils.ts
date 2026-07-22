export interface BundleEntry {
  file: string
  sizeBytes: number
  sizeHuman: string
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
