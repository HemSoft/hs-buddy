/**
 * Auto-increment the PATCH (revision) version on every commit/build.
 *
 * 1. Bumps the patch number in package.json
 * 2. Updates version strings in AboutModal.tsx, WelcomePanel.tsx, TitleBar.tsx
 *
 * CHANGELOG header creation is handled by changelog-from-commit.ts
 * (runs in the post-commit hook after this commit, then amends to include it).
 *
 * Usage: bun scripts/bump-revision.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// --- 1. Bump package.json ---
const pkgPath = resolve(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)
const newVersion = `${major}.${minor}.${patch + 1}`
pkg.version = newVersion
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
console.log(`✓ package.json  ${major}.${minor}.${patch} → ${newVersion}`)

// --- 2. Update version strings in components ---
const versionFiles = [
  {
    path: resolve(ROOT, 'src', 'components', 'AboutModal.tsx'),
    pattern: /Version \d+\.\d+\.\d+/g,
    replacement: `Version ${newVersion}`,
  },
  {
    path: resolve(ROOT, 'src', 'components', 'WelcomePanel.tsx'),
    pattern: /Version \d+\.\d+\.\d+/g,
    replacement: `Version ${newVersion}`,
  },
  {
    path: resolve(ROOT, 'src', 'components', 'TitleBar.tsx'),
    pattern: /V\d+\.\d+\.\d+/g,
    replacement: `V${newVersion}`,
  },
]

for (const { path: filePath, pattern, replacement } of versionFiles) {
  if (!existsSync(filePath)) continue
  const src = readFileSync(filePath, 'utf-8')
  if (pattern.test(src)) {
    pattern.lastIndex = 0 // reset regex state
    writeFileSync(filePath, src.replace(pattern, replacement), 'utf-8')
    const name = filePath.split(/[\\/]/).pop()
    console.log(`✓ ${name}  → ${replacement}`)
  }
}

// CHANGELOG header creation is handled by changelog-from-commit.ts
// (runs in the post-commit hook after this commit, then amends to include it).

console.log(`\n🏷️  Revision bumped to ${newVersion}`)
