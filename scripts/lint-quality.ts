/**
 * Quality Gate Lint
 *
 * Runs ESLint with quality gate rules enabled (max-lines, max-lines-per-function,
 * sonarjs/cognitive-complexity). These rules are behind the ESLINT_QUALITY env var
 * so they don't break the strict `bun run lint` (--max-warnings 0) pipeline.
 *
 * Run: bun scripts/lint-quality.ts
 */
import { spawnSync } from 'child_process'

const result = spawnSync('bunx', ['eslint', '.'], {
  stdio: 'inherit',
  env: { ...process.env, ESLINT_QUALITY: '1' },
  cwd: process.cwd(),
})

if (result.error || result.status === null) {
  console.error('Failed to run eslint:', result.error?.message ?? 'unknown error')
  process.exit(1)
}

// Exit 0 even if warnings exist — this is informational, not blocking.
// Exit non-zero only if eslint itself crashed (exit code 2).
process.exit(result.status === 2 ? 2 : 0)
