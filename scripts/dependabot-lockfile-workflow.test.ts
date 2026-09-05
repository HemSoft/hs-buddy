import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const normalizeLineEndings = (text: string): string => text.replaceAll('\r\n', '\n')

const readRepositoryText = (path: string): string =>
  normalizeLineEndings(readFileSync(resolve(process.cwd(), path), 'utf8'))

const workflow = readRepositoryText('.github/workflows/dependabot-lockfile.yml')
const ciWorkflow = readRepositoryText('.github/workflows/ci.yml')
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const convexConfig = readRepositoryText('vitest.convex.config.ts')

const stepNames = [...workflow.matchAll(/^\s+- name: (.+)$/gm)].map(match => match[1])
const convexJob = ciWorkflow.slice(
  ciWorkflow.indexOf('\n  test-convex:\n'),
  ciWorkflow.indexOf('\n  test-e2e:\n')
)

describe('workflow text normalization', () => {
  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('normalizes %s text before section and multiline assertions', (_label, lineEnding) => {
    const fixture = [
      'jobs:',
      '  test-convex:',
      '    run: bun run test:convex:coverage',
      '  test-e2e:',
      '    run: |',
      '      gh run watch "$RUN_ID" --exit-status',
      '      watch_exit=$?',
    ].join(lineEnding)
    const normalized = normalizeLineEndings(fixture)
    const convexFixture = normalized.slice(
      normalized.indexOf('\n  test-convex:\n'),
      normalized.indexOf('\n  test-e2e:\n')
    )

    expect(convexFixture).toContain('run: bun run test:convex:coverage')
    expect(normalized).toContain('--exit-status\n      watch_exit=$?')
  })
})

describe('Dependabot Lockfile Fix workflow', () => {
  it('keeps the lockfile update and generated-commit CI path', () => {
    expect(stepNames).toEqual(
      expect.arrayContaining([
        'Update lockfile',
        'Verify frozen install',
        'Commit updated lockfile',
        'Dispatch generated-commit CI',
        'Wait for generated-commit CI',
      ])
    )
  })

  it('does not duplicate the application CI suite', () => {
    expect(stepNames).not.toEqual(
      expect.arrayContaining([
        'Lint (ESLint)',
        'Type check (TypeScript + Convex)',
        'Run tests with coverage',
        'Run E2E tests',
        'Build (vite + electron)',
      ])
    )
  })

  it('does not claim the generated commit was pre-validated', () => {
    expect(workflow).not.toContain('statuses: write')
    expect(stepNames).not.toContain('Mark pushed lockfile commit as validated')
    expect(workflow).not.toContain('Dependabot Lockfile Fix / validated')
  })

  it('delegates generated commits to coverage-gated Convex follow-up CI', () => {
    expect(ciWorkflow).toContain('  workflow_dispatch:')
    expect(workflow).toContain('gh workflow run ci.yml --ref "$TARGET_REF"')
    expect(workflow).toContain('--event workflow_dispatch')
    expect(workflow).toContain('--commit "$TARGET_SHA"')
    expect(workflow).toContain('No workflow_dispatch CI run appeared for $TARGET_SHA')
    expect(workflow).toContain(
      'gh run watch "${{ steps.dispatch-ci.outputs.run_id }}" --compact --exit-status'
    )
    expect(workflow).not.toContain('run: bun run test:convex')
    expect(convexJob).toContain('run: bun run test:convex:coverage')
    expect(packageJson.scripts['test:convex:coverage']).toContain('--coverage')
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      expect(convexConfig).toContain(`${metric}: 90`)
    }
  })

  it('tolerates queueing delays when waiting for the dispatched run to appear', () => {
    expect(workflow).toContain('for attempt in $(seq 1 60); do')
    expect(workflow).toContain('($attempt/60)')

    // The queue-timeout path degrades to a warning only when another ci.yml
    // run covers the SHA (warning immediately followed by exit 0); with no
    // coverage anywhere it must fail loudly instead.
    const dispatchStep = workflow.slice(
      workflow.indexOf('- name: Dispatch generated-commit CI'),
      workflow.indexOf('- name: Wait for generated-commit CI')
    )
    const scriptLines = dispatchStep
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'))
    const warningIndex = scriptLines.findIndex(line =>
      line.includes('::warning::No workflow_dispatch CI run appeared')
    )
    expect(warningIndex).toBeGreaterThan(-1)
    expect(scriptLines[warningIndex + 1]).toBe('exit 0')
    expect(scriptLines.at(-2)).toContain('refusing to skip generated-commit validation')
    expect(scriptLines.at(-1)).toBe('exit 1')
    expect(workflow).toContain("steps.dispatch-ci.outputs.run_id != ''")
    expect(dispatchStep).toContain('--commit "$TARGET_SHA"')
  })

  it('treats a cancelled dispatched run as superseded only by a newer commit', () => {
    expect(workflow).toContain('--exit-status\n          watch_exit=$?')
    expect(workflow).toContain('"$conclusion" = "cancelled"')
    expect(workflow).toContain('git ls-remote origin "refs/heads/$TARGET_REF"')
    expect(workflow).toContain('no newer commit supersedes $TARGET_SHA')
    expect(workflow).toMatch(/::warning::Dispatched CI run \$RUN_ID was cancelled/)
  })
})
