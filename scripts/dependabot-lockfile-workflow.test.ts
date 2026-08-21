import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/dependabot-lockfile.yml'),
  'utf8'
)
const ciWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const convexConfig = readFileSync(resolve(process.cwd(), 'vitest.convex.config.ts'), 'utf8')

const stepNames = [...workflow.matchAll(/^\s+- name: (.+)$/gm)].map(match => match[1])
const convexJob = ciWorkflow.slice(
  ciWorkflow.indexOf('\n  test-convex:\n'),
  ciWorkflow.indexOf('\n  test-e2e:\n')
)

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
})
