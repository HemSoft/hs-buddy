import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/dependabot-lockfile.yml'),
  'utf8'
)

const stepNames = [...workflow.matchAll(/^\s+- name: (.+)$/gm)].map(match => match[1])

describe('Dependabot Lockfile Fix workflow', () => {
  it('keeps the lockfile update and follow-up approval path', () => {
    expect(stepNames).toEqual(
      expect.arrayContaining([
        'Update lockfile',
        'Verify frozen install',
        'Commit updated lockfile',
        'Approve follow-up runs',
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
})
