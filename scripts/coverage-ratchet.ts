/**
 * Coverage Ratchet
 *
 * Reads the current coverage summary from lcov and updates vitest.config.ts
 * thresholds to match the current floor. Thresholds can only go UP, never DOWN.
 *
 * Run: bun scripts/coverage-ratchet.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const configPath = resolve(import.meta.dirname, '..', 'vitest.config.ts')
const coveragePath = resolve(import.meta.dirname, '..', 'coverage', 'lcov.info')

// Parse lcov.info to get coverage percentages
function parseLcov(lcov: string) {
  let linesHit = 0, linesFound = 0
  let branchesHit = 0, branchesFound = 0
  let functionsHit = 0, functionsFound = 0

  for (const line of lcov.split('\n')) {
    const [key, value] = line.split(':')
    const num = parseInt(value, 10)
    if (isNaN(num)) continue
    switch (key) {
      case 'LH': linesHit += num; break
      case 'LF': linesFound += num; break
      case 'BRH': branchesHit += num; break
      case 'BRF': branchesFound += num; break
      case 'FNH': functionsHit += num; break
      case 'FNF': functionsFound += num; break
    }
  }

  return {
    lines: linesFound > 0 ? Math.floor((linesHit / linesFound) * 100) : 0,
    branches: branchesFound > 0 ? Math.floor((branchesHit / branchesFound) * 100) : 0,
    functions: functionsFound > 0 ? Math.floor((functionsHit / functionsFound) * 100) : 0,
    statements: linesFound > 0 ? Math.floor((linesHit / linesFound) * 100) : 0,
  }
}

// Extract current thresholds from vitest.config.ts
function parseThresholds(config: string) {
  const match = config.match(/thresholds:\s*\{([^}]+)\}/)
  if (!match) throw new Error('Could not find thresholds in vitest.config.ts')
  const block = match[1]
  const get = (key: string) => {
    const m = block.match(new RegExp(`${key}\\s*:\\s*(\\d+)`))
    return m ? parseInt(m[1], 10) : 0
  }
  const result = { statements: get('statements'), branches: get('branches'), functions: get('functions'), lines: get('lines') }
  if (Object.values(result).every(v => v === 0)) {
    throw new Error('Could not parse any thresholds from vitest.config.ts — format may have changed')
  }
  return result
}

try {
  const lcov = readFileSync(coveragePath, 'utf-8')
  if (!lcov.trim()) {
    throw new Error('lcov.info is empty — coverage may not have been generated')
  }
  const current = parseLcov(lcov)
  const config = readFileSync(configPath, 'utf-8')
  const existing = parseThresholds(config)

  // Ratchet: only go UP
  const next = {
    statements: Math.max(existing.statements, current.statements),
    branches: Math.max(existing.branches, current.branches),
    functions: Math.max(existing.functions, current.functions),
    lines: Math.max(existing.lines, current.lines),
  }

  const changed = Object.keys(next).some(k => next[k as keyof typeof next] !== existing[k as keyof typeof existing])
  if (!changed) {
    console.log('Coverage ratchet: no threshold increase needed.')
    console.log(`  Current: S=${existing.statements}% B=${existing.branches}% F=${existing.functions}% L=${existing.lines}%`)
    process.exit(0)
  }

  // Update config
  const updated = config.replace(
    /thresholds:\s*\{[^}]+\}/,
    `thresholds: {\n        statements: ${next.statements},\n        branches: ${next.branches},\n        functions: ${next.functions},\n        lines: ${next.lines},\n      }`
  )
  if (updated === config) throw new Error('Threshold replacement failed—vitest.config.ts format may have changed')
  writeFileSync(configPath, updated)

  console.log('Coverage ratchet: thresholds updated!')
  console.log(`  Before: S=${existing.statements}% B=${existing.branches}% F=${existing.functions}% L=${existing.lines}%`)
  console.log(`  After:  S=${next.statements}% B=${next.branches}% F=${next.functions}% L=${next.lines}%`)
} catch (err) {
  console.error('Coverage ratchet failed:', (err as Error).message)
  console.error('Make sure to run `bun run test:coverage` first to generate lcov.info')
  process.exit(1)
}
