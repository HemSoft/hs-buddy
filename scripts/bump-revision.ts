/**
 * Auto-increment the PATCH (revision) version on every commit/build.
 *
 * 1. Bumps the patch number in package.json
 * 2. Updates version strings in AboutModal.tsx, WelcomePanel.tsx, TitleBar.tsx
 * 3. Promotes [Unreleased] CHANGELOG entries into a dated version section
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
  { path: resolve(ROOT, 'src', 'components', 'AboutModal.tsx'), pattern: /Version \d+\.\d+\.\d+/g, replacement: `Version ${newVersion}` },
  { path: resolve(ROOT, 'src', 'components', 'WelcomePanel.tsx'), pattern: /Version \d+\.\d+\.\d+/g, replacement: `Version ${newVersion}` },
  { path: resolve(ROOT, 'src', 'components', 'TitleBar.tsx'), pattern: /V\d+\.\d+\.\d+/g, replacement: `V${newVersion}` },
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

// --- 3. Update CHANGELOG.md ---
const changelogPath = resolve(ROOT, 'CHANGELOG.md')
if (existsSync(changelogPath)) {
  let changelog = readFileSync(changelogPath, 'utf-8')

  // Normalize line endings for consistent regex matching
  changelog = changelog.replace(/\r\n/g, '\n')

  // Match the [Unreleased] section and its content up to the next ## heading
  const unreleasedRegex = /## \[Unreleased\]\n((?:.|\n)*?)(?=\n## \[|$)/
  const match = changelog.match(unreleasedRegex)

  if (match) {
    const unreleasedContent = match[1].trim()
    const today = new Date().toISOString().slice(0, 10)

    if (unreleasedContent.length > 0) {
      // Promote [Unreleased] content → new versioned section
      changelog = changelog.replace(
        unreleasedRegex,
        `## [Unreleased]\n\n## [${newVersion}] - ${today}\n${match[1]}`
      )
      console.log(`✓ CHANGELOG.md   [Unreleased] → [${newVersion}] - ${today}`)
    } else {
      // [Unreleased] is empty — insert version header with placeholder
      changelog = changelog.replace(
        /## \[Unreleased\]\n/,
        `## [Unreleased]\n\n## [${newVersion}] - ${today}\n\n- Version bump\n`
      )
      console.log(`✓ CHANGELOG.md   [${newVersion}] - ${today} (empty unreleased, added placeholder)`)
    }

    writeFileSync(changelogPath, changelog, 'utf-8')
  } else {
    console.warn('⚠ CHANGELOG.md: [Unreleased] section not found, skipped')
  }
} else {
  console.warn('⚠ CHANGELOG.md not found, skipped')
}

console.log(`\n🏷️  Revision bumped to ${newVersion}`)
