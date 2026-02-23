/**
 * commit-msg hook — Populate CHANGELOG.md from the Conventional Commit message.
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
 * Reads the commit message from the file path passed as argv[2] (standard
 * git commit-msg hook argument), extracts the subject line, and inserts
 * a categorized entry into the most recent version section of CHANGELOG.md.
 *
 * Usage: bun scripts/changelog-from-commit.ts <commit-msg-file>
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const changelogPath = resolve(ROOT, 'CHANGELOG.md')

// Read commit message file (passed by git as $1)
const commitMsgFile = process.argv[2]
if (!commitMsgFile) {
  console.warn('⚠ changelog-from-commit: no commit message file provided')
  process.exit(0)
}

const commitMsg = readFileSync(commitMsgFile, 'utf-8').trim()

// Extract subject line (first non-comment, non-empty line)
const subject = commitMsg
  .split('\n')
  .find(line => line.trim() && !line.startsWith('#'))

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

if (!existsSync(changelogPath)) {
  process.exit(0)
}

let changelog = readFileSync(changelogPath, 'utf-8').replace(/\r\n/g, '\n')

// Find the most recent version section (first ## [x.y.z] after [Unreleased])
const versionHeaderRegex = /## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}\n/
const versionMatch = changelog.match(versionHeaderRegex)

if (!versionMatch || versionMatch.index === undefined) {
  process.exit(0)
}

const insertPos = versionMatch.index + versionMatch[0].length

// Check what follows the version header
const afterHeader = changelog.slice(insertPos)

// Check if this category already has a section under this version
const nextSectionRegex = /\n## \[/
const sectionEnd = afterHeader.search(nextSectionRegex)
const versionBlock = sectionEnd >= 0 ? afterHeader.slice(0, sectionEnd) : afterHeader

// Build the entry line
const entryLine = `- ${description.charAt(0).toUpperCase() + description.slice(1)}`

if (versionBlock.includes(`### ${category}`)) {
  // Category exists — append entry after the category heading
  const catHeadingPos = changelog.indexOf(`### ${category}`, insertPos)
  const afterCatHeading = changelog.indexOf('\n', catHeadingPos) + 1

  // Find end of this category's entries (next ### or ## or end of section)
  const restAfterCat = changelog.slice(afterCatHeading)
  const catEndMatch = restAfterCat.search(/\n###|\n## \[/)
  const catInsertPos = catEndMatch >= 0 ? afterCatHeading + catEndMatch : afterCatHeading + restAfterCat.length

  // Insert before the blank line that precedes the next section
  let insertAt = catInsertPos
  while (insertAt > afterCatHeading && changelog[insertAt - 1] === '\n') {
    insertAt--
  }

  changelog = changelog.slice(0, insertAt) + '\n' + entryLine + changelog.slice(insertAt)
} else {
  // Category doesn't exist — insert a new category section
  // First, check if there's already content (other categories)
  const trimmedBlock = versionBlock.trim()
  let newContent: string

  if (trimmedBlock.length === 0 || trimmedBlock === '- Version bump') {
    // Empty or placeholder — replace with categorized entry
    const blockStart = insertPos
    const blockEnd = sectionEnd >= 0 ? insertPos + sectionEnd : changelog.length
    const before = changelog.slice(0, blockStart)
    const after = changelog.slice(blockEnd)
    newContent = `\n### ${category}\n\n${entryLine}\n`
    changelog = before + newContent + after
  } else {
    // Other categories exist — add new category section at the end of the version block
    let insertAt = sectionEnd >= 0 ? insertPos + sectionEnd : changelog.length
    while (insertAt > insertPos && changelog[insertAt - 1] === '\n') {
      insertAt--
    }
    newContent = `\n\n### ${category}\n\n${entryLine}\n`
    changelog = changelog.slice(0, insertAt) + newContent + '\n' + changelog.slice(insertAt)
  }
}

writeFileSync(changelogPath, changelog, 'utf-8')
console.log(`✓ CHANGELOG.md   ${category}: ${description}`)
