/**
 * Quality Gate Lint
 *
 * Runs ESLint with quality gate rules enabled (max-lines, max-lines-per-function,
 * sonarjs/cognitive-complexity). These rules are behind the ESLINT_QUALITY env var
 * so they don't break the strict `bun run lint` (--max-warnings 0) pipeline.
 *
 * Uses --max-warnings 0 so that any quality-rule violations (configured as warnings)
 * produce a non-zero exit code, surfacing regressions in CI.
 *
 * Run: bun scripts/lint-quality.ts
 */
import { spawnSync } from 'node:child_process'

const result = spawnSync('bunx', ['eslint', '--max-warnings', '0', '.'], {
  stdio: 'inherit',
  env: { ...process.env, ESLINT_QUALITY: '1' },
  cwd: process.cwd(),
})

if (result.error || result.status === null) {
  console.error('Failed to run eslint:', result.error?.message ?? 'unknown error')
  process.exit(1)
}

// Pass through ESLint's exit code so CI step status reflects actual findings.
// The CI job uses continue-on-error: true to keep it non-blocking.
process.exit(result.status)
