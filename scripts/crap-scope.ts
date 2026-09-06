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

export function ownedFiles(suite: CrapSuite): string[] {
  const roots = suite === 'renderer' ? ['src', 'shared'] : [suite]
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...roots],
    { encoding: 'utf8' }
  )
    .split('\0')
    .filter(file => /\.tsx?$/.test(file))
    .sort()
}

export function sourceFingerprint(suite: CrapSuite): string {
  const config = [
    'vitest.config.ts',
    'vitest.electron.config.ts',
    'vitest.convex.config.ts',
    'vitest.crap.config.ts',
    'bun.lock',
    'scripts/crap-source.ts',
    'scripts/crap-scope.ts',
    'scripts/crap-instrumenter.ts',
    'scripts/crap-coverage.ts',
  ]
  const hash = createHash('sha256')
  for (const file of [...ownedFiles(suite), ...config].sort()) {
    hash.update(file + '\0' + readFileSync(file, 'utf8').replaceAll('\r\n', '\n') + '\0')
  }
  return hash.digest('hex')
}

export function isMeasuredFile(file: string): boolean {
  return !CRAP_EXCLUSIONS.some(pattern => matchesGlob(file, pattern))
}
