/**
 * Auto-increment the PATCH (revision) version on every commit/build.
 *
 * 1. Bumps the patch number in package.json
 * 2. Renderer components read the version from src/constants/appVersion.ts,
 *    which re-exports package.json as the single source of truth.
 *
 * CHANGELOG header creation is handled by changelog-from-commit.ts
 * (runs in the post-commit hook after this commit, then amends to include it).
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

// CHANGELOG header creation is handled by changelog-from-commit.ts
// (runs in the post-commit hook after this commit, then amends to include it).

console.log(`\n🏷️  Revision bumped to ${newVersion}`)
