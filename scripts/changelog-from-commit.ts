/**
 * post-commit hook — Populate CHANGELOG.md from the Conventional Commit message.
 *
 * Called from .husky/post-commit after the commit is created. The post-commit
 * hook amends the commit to include the generated CHANGELOG.md entry.
 *
 * This script is responsible for BOTH creating the version header AND inserting
 * the changelog entry atomically.
 *
 * Maps Conventional Commits prefixes to Keep a Changelog categories:
 *   feat     → Added
 *   fix      → Fixed
 *   docs     → Changed
 *   refactor → Changed
 *   perf     → Changed
 *   chore    → Changed
 *   test     → Changed
 *   style    → Changed
 *   ci       → Changed
 *   build    → Changed
 *   revert   → Removed
 *
 * Also cleans up any empty version headers left over from previous attempts.
 *
 * Usage: bun scripts/changelog-from-commit.ts <commit-msg-file>
 *        (typically .git/COMMIT_EDITMSG from post-commit hook)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const changelogPath = resolve(ROOT, 'CHANGELOG.md')
const pkgPath = resolve(ROOT, 'package.json')

// Read commit message file (passed by git as $1)
const commitMsgFile = process.argv[2]
if (!commitMsgFile) {
  console.warn('⚠ changelog-from-commit: no commit message file provided')
  process.exit(0)
}

if (!existsSync(commitMsgFile)) {
  console.warn(`⚠ changelog-from-commit: ${commitMsgFile} not found`)
  process.exit(0)
}

const commitMsg = readFileSync(commitMsgFile, 'utf-8').trim()

// Extract subject line (first non-comment, non-empty line)
const subject = commitMsg.split('\n').find(line => line.trim() && !line.startsWith('#'))

if (!subject) {
  process.exit(0)
}

// Parse Conventional Commit: type(scope)!: description
const ccRegex = /^(\w+)(?:\(.+?\))?!?:\s+(.+)$/
const match = subject.match(ccRegex)

if (!match) {
  // Not a Conventional Commit — skip silently
  process.exit(0)
}

const [, type, description] = match

// Map CC type → Keep a Changelog category
const categoryMap: Record<string, string> = {
  feat: 'Added',
  fix: 'Fixed',
  docs: 'Changed',
  refactor: 'Changed',
  perf: 'Changed',
  chore: 'Changed',
  test: 'Changed',
  style: 'Changed',
  ci: 'Changed',
  build: 'Changed',
  revert: 'Removed',
}

const category = categoryMap[type]
if (!category) {
  process.exit(0)
}

if (!existsSync(changelogPath) || !existsSync(pkgPath)) {
  process.exit(0)
}

let changelog = readFileSync(changelogPath, 'utf-8').replace(/\r\n/g, '\n')

// Read the current version from package.json (already bumped by pre-commit hook)
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const version: string = pkg.version
const today = new Date().toISOString().slice(0, 10)

// --- Step 1: Ensure the version header exists ---
if (!changelog.includes(`## [${version}]`)) {
  const unreleasedRegex = /## \[Unreleased\]\n((?:.|\n)*?)(?=\n## \[|$)/
  const unreleasedMatch = changelog.match(unreleasedRegex)

  if (unreleasedMatch) {
    const unreleasedContent = unreleasedMatch[1].trim()

    if (unreleasedContent.length > 0) {
      // Promote [Unreleased] content into the new version
      changelog = changelog.replace(
        unreleasedRegex,
        `## [Unreleased]\n\n## [${version}] - ${today}\n${unreleasedMatch[1]}`
      )
    } else {
      // Insert version header after [Unreleased]
      changelog = changelog.replace(
        /## \[Unreleased\]\n/,
        `## [Unreleased]\n\n## [${version}] - ${today}\n`
      )
    }
  }
}

// --- Step 2: Clean up empty version headers from failed attempts ---
// An empty header is: ## [x.y.z] - date\n followed by whitespace then another ## [ or EOF
// But NOT the current version header (we just created it and are about to fill it)
const emptyHeaderRegex = /## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}\n\s*(?=## \[|$)/g
let cleaned = changelog
const removedVersions: string[] = []
cleaned = changelog.replace(emptyHeaderRegex, (fullMatch, ver) => {
  if (ver === version) return fullMatch // Keep the current version
  removedVersions.push(ver)
  return ''
})
if (removedVersions.length > 0) {
  changelog = cleaned
  console.log(`✓ CHANGELOG.md   Removed empty headings: ${removedVersions.join(', ')}`)
}

// --- Step 3: Insert the changelog entry under the current version ---
const targetHeader = `## [${version}]`
const targetHeaderRegex = new RegExp(
  `## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}\n`
)
const versionMatch = changelog.match(targetHeaderRegex)

if (!versionMatch || versionMatch.index === undefined) {
  console.warn(`⚠ changelog-from-commit: could not find ${targetHeader} header in CHANGELOG.md`)
  process.exit(0)
}

const insertPos = versionMatch.index + versionMatch[0].length
const afterHeader = changelog.slice(insertPos)

const nextSectionRegex = /\n## \[/
const sectionEnd = afterHeader.search(nextSectionRegex)
const versionBlock = sectionEnd >= 0 ? afterHeader.slice(0, sectionEnd) : afterHeader

const entryLine = `- ${description.charAt(0).toUpperCase() + description.slice(1)}`

// Idempotency: skip if this exact entry already exists under this version.
// Use line-boundary matching to avoid false positives when entryLine is a
// substring of an existing bullet (e.g. "Fix X" matching "Fix X and Y").
if (versionBlock.split('\n').some(line => line.trimEnd() === entryLine)) {
  // Steps 1/2 may have created the version header or cleaned empty headers —
  // write those changes before exiting.
  writeFileSync(changelogPath, changelog, 'utf-8')
  console.log(`✓ CHANGELOG.md   (already has: ${description})`)
  process.exit(0)
}

if (versionBlock.includes(`### ${category}`)) {
  // Category exists — append entry after the category heading
  const catHeadingPos = changelog.indexOf(`### ${category}`, insertPos)
  const afterCatHeading = changelog.indexOf('\n', catHeadingPos) + 1

  const restAfterCat = changelog.slice(afterCatHeading)
  const catEndMatch = restAfterCat.search(/\n###|\n## \[/)
  const catInsertPos =
    catEndMatch >= 0 ? afterCatHeading + catEndMatch : afterCatHeading + restAfterCat.length

  let insertAt = catInsertPos
  while (insertAt > afterCatHeading && changelog[insertAt - 1] === '\n') {
    insertAt--
  }

  changelog = changelog.slice(0, insertAt) + '\n' + entryLine + changelog.slice(insertAt)
} else {
  const trimmedBlock = versionBlock.trim()
  let newContent: string

  if (trimmedBlock.length === 0 || trimmedBlock === '- Version bump') {
    const blockStart = insertPos
    const blockEnd = sectionEnd >= 0 ? insertPos + sectionEnd : changelog.length
    const before = changelog.slice(0, blockStart)
    const after = changelog.slice(blockEnd)
    newContent = `\n### ${category}\n\n${entryLine}\n`
    changelog = before + newContent + after
  } else {
    let insertAt = sectionEnd >= 0 ? insertPos + sectionEnd : changelog.length
    while (insertAt > insertPos && changelog[insertAt - 1] === '\n') {
      insertAt--
    }
    newContent = `\n\n### ${category}\n\n${entryLine}\n`
    let resumeAt = insertAt
    while (resumeAt < changelog.length && changelog[resumeAt] === '\n') {
      resumeAt++
    }
    const remaining = changelog.slice(resumeAt)
    changelog =
      changelog.slice(0, insertAt) + newContent + (remaining.length > 0 ? '\n' : '') + remaining
  }
}

writeFileSync(changelogPath, changelog, 'utf-8')
console.log(`✓ CHANGELOG.md   ${category}: ${description}`)
