import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'

export const CRAP_SUITES = ['renderer', 'electron', 'convex'] as const
export type CrapSuite = (typeof CRAP_SUITES)[number]
export const CRAP_EXCLUSIONS = [
  '**/*.d.ts',
  '**/*.{test,spec,bench}.{ts,tsx}',
  '**/__tests__/**',
  '**/__mocks__/**',
  'convex/_generated/**',
  'src/test/**',
  'src/features/**/*.steps.ts',
  'src/dev/**',
  'src/browser-ipc-mock.ts',
]

function repositoryFiles(roots: string[]): string[] {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...roots],
    { encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean)
    .sort()
}

export function ownedFiles(suite: CrapSuite): string[] {
  return repositoryFiles(suite === 'renderer' ? ['src', 'shared'] : [suite]).filter(file =>
    /\.tsx?$/.test(file)
  )
}

export function sourceFingerprint(suite: CrapSuite): string {
  // Tests import source across roots and load features, fixtures and workflows.
  // Hash every Git-visible input so an extension allowlist cannot omit one.
  const hash = createHash('sha256')
  hash.update(suite + '\0')
  for (const file of [...new Set(repositoryFiles([]))].sort()) {
    hash
      .update(file + '\0')
      .update(readFileSync(file))
      .update('\0')
  }
  return hash.digest('hex')
}

export function isMeasuredFile(file: string): boolean {
  return !CRAP_EXCLUSIONS.some(pattern => matchesGlob(file, pattern))
}
