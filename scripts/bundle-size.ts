/**
 * Bundle Size Check
 *
 * Measures vite build output sizes and compares against a baseline file.
 * Fails if any bundle exceeds its baseline by more than the allowed threshold.
 *
 * Usage:
 *   bun scripts/bundle-size.ts              # check against baseline
 *   bun scripts/bundle-size.ts --update     # update baseline to current sizes
 *
 * The baseline is stored in bundle-size-baseline.json (committed to repo).
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { deduplicateBundles, normalizeBundleFile, type BundleEntry } from './bundle-size-utils'

const root = resolve(import.meta.dirname, '..')
const baselinePath = resolve(root, 'bundle-size-baseline.json')

// 5% growth allowed before warning, 10% before failure
const WARN_THRESHOLD = 0.05
const FAIL_THRESHOLD = 0.1

interface Baseline {
  updatedAt: string
  bundles: BundleEntry[]
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(2)} kB`
  return `${(kb / 1024).toFixed(2)} MB`
}

function collectRendererAssets(distDir: string): BundleEntry[] {
  const assetsDir = resolve(distDir, 'assets')
  if (!existsSync(assetsDir)) return []
  return readdirSync(assetsDir)
    .filter(f => f.endsWith('.js') || f.endsWith('.css'))
    .map(f => {
      const size = statSync(resolve(assetsDir, f)).size
      return { file: `dist/assets/${f}`, sizeBytes: size, sizeHuman: humanSize(size) }
    })
}

function collectElectronMainChunks(distElectronDir: string): BundleEntry[] {
  const mainPath = resolve(distElectronDir, 'main.js')
  if (!existsSync(mainPath)) return []

  const chunks: BundleEntry[] = []
  const pending = [mainPath]
  const visited = new Set<string>()
  const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])(\.[^"']+\.js)\1/g

  while (pending.length > 0) {
    const filePath = pending.pop()
    if (!filePath || visited.has(filePath)) continue
    visited.add(filePath)

    const size = statSync(filePath).size
    chunks.push({
      file: `dist-electron/${relative(distElectronDir, filePath).replaceAll('\\', '/')}`,
      sizeBytes: size,
      sizeHuman: humanSize(size),
    })

    const source = readFileSync(filePath, 'utf-8')
    for (const match of source.matchAll(importPattern)) {
      const importedPath = resolve(dirname(filePath), match[2])
      if (!existsSync(importedPath)) {
        throw new Error(
          `Missing Electron chunk ${basename(importedPath)} imported by ${basename(filePath)}.`
        )
      }
      pending.push(importedPath)
    }
  }

  return chunks
}

function collectBundles(): BundleEntry[] {
  const distDir = resolve(root, 'dist')
  const distElectronDir = resolve(root, 'dist-electron')

  const bundles = [...collectRendererAssets(distDir)]

  const preload = resolve(distElectronDir, 'preload.mjs')
  if (existsSync(preload)) {
    const size = statSync(preload).size
    bundles.push({ file: 'dist-electron/preload.mjs', sizeBytes: size, sizeHuman: humanSize(size) })
  }

  const mainChunks = collectElectronMainChunks(distElectronDir)
  if (mainChunks.length === 0) {
    throw new Error(
      'Missing dist-electron/main.js. Run a clean Electron build before bundle-size check.'
    )
  }
  bundles.push(...mainChunks)

  return bundles.sort((a, b) => b.sizeBytes - a.sizeBytes)
}

const isUpdate = process.argv.includes('--update')

try {
  const bundles = deduplicateBundles(collectBundles())

  if (bundles.length === 0) {
    console.error('No bundles found. Run `npx vite build` first.')
    process.exit(1)
  }

  if (isUpdate) {
    const baseline: Baseline = {
      updatedAt: new Date().toISOString(),
      bundles,
    }
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n')
    console.log('Bundle size baseline updated:')
    for (const b of baseline.bundles) {
      console.log(`  ${b.file.padEnd(35)} ${b.sizeHuman}`)
    }
    process.exit(0)
  }

  // Compare against baseline
  if (!existsSync(baselinePath)) {
    console.log('No baseline found. Current bundle sizes:')
    for (const b of bundles) {
      console.log(`  ${normalizeBundleFile(b.file).padEnd(35)} ${b.sizeHuman}`)
    }
    console.log('\nRun with --update to create the baseline.')
    process.exit(0)
  }

  const baseline: Baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'))
  const baselineMap = new Map(baseline.bundles.map(b => [b.file, b]))

  let hasFailure = false
  let hasWarning = false

  console.log('Bundle size check:')
  console.log(
    `  ${'Bundle'.padEnd(35)} ${'Current'.padStart(12)} ${'Baseline'.padStart(12)} ${'Δ'.padStart(10)}`
  )
  console.log(`  ${'─'.repeat(35)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(10)}`)

  for (const bundle of bundles) {
    const norm = normalizeBundleFile(bundle.file)
    const base = baselineMap.get(norm)

    if (!base) {
      console.log(`  ${norm.padEnd(35)} ${bundle.sizeHuman.padStart(12)} ${'(new)'.padStart(12)}`)
      continue
    }

    const delta = bundle.sizeBytes - base.sizeBytes
    const pct = base.sizeBytes > 0 ? delta / base.sizeBytes : 0
    const pctStr = `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(1)}%`
    let marker = ''
    if (pct > FAIL_THRESHOLD) {
      marker = ' FAIL'
      hasFailure = true
    } else if (pct > WARN_THRESHOLD) {
      marker = ' WARN'
      hasWarning = true
    }

    console.log(
      `  ${norm.padEnd(35)} ${bundle.sizeHuman.padStart(12)} ${base.sizeHuman.padStart(12)} ${pctStr.padStart(10)}${marker}`
    )
  }

  if (hasFailure) {
    console.error(
      '\nBundle size increased beyond 10% threshold. Run `bun run bundle-size:update` to accept the new sizes.'
    )
    process.exit(1)
  }
  if (hasWarning) {
    console.warn('\nBundle size increased beyond 5% — consider investigating.')
  }

  console.log('\nBundle sizes within threshold.')
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  console.error('Bundle size check failed:', message)
  process.exit(1)
}
