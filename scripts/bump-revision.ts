/**
 * Auto-increment the PATCH (revision) version on every build.
 *
 * Reads version from package.json, bumps the patch number,
 * and updates both package.json and src/components/AboutModal.tsx.
 *
 * Usage: bun scripts/bump-revision.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
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

// --- 2. Update AboutModal.tsx ---
const aboutPath = resolve(ROOT, 'src', 'components', 'AboutModal.tsx')
let aboutSrc = readFileSync(aboutPath, 'utf-8')
const versionRegex = /Version \d+\.\d+\.\d+/
if (versionRegex.test(aboutSrc)) {
  aboutSrc = aboutSrc.replace(versionRegex, `Version ${newVersion}`)
  writeFileSync(aboutPath, aboutSrc, 'utf-8')
  console.log(`✓ AboutModal.tsx  → Version ${newVersion}`)
} else {
  console.warn('⚠ AboutModal.tsx: version string not found, skipped')
}

console.log(`\n🏷️  Revision bumped to ${newVersion}`)
