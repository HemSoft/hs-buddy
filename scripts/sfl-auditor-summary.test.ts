import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const workflowPath = join(import.meta.dirname, '..', '.github', 'workflows', 'sfl-auditor.yml')
const temporaryDirectories: string[] = []

interface AuditorCounts {
  conflicting: number
  duplicates: number
  orphanedLabels: number
  orphanedPrs: number
  paused: number
  prFallbacks: number
  staleUnclaimed: number
  stalledPrs: number
}

const outputExpressions: Record<keyof AuditorCounts, string> = {
  conflicting: '${{ steps.conflicting.outputs.conflicting_fixed }}',
  duplicates: '${{ steps.duplicate-issues.outputs.duplicate_issues_closed }}',
  orphanedLabels: '${{ steps.orphaned-labels.outputs.orphaned_labels_fixed }}',
  orphanedPrs: '${{ steps.orphaned-prs.outputs.orphaned_prs_found }}',
  paused: '${{ steps.paused.outputs.unexplained_pause_found }}',
  prFallbacks: '${{ steps.pr-fallbacks.outputs.pr_fallbacks_fixed }}',
  staleUnclaimed: '${{ steps.stale-unclaimed.outputs.stale_unclaimed_found }}',
  stalledPrs: '${{ steps.stalled-prs.outputs.stalled_prs_found }}',
}

function summaryScript(counts: AuditorCounts): string {
  const workflow = readFileSync(workflowPath, 'utf8').replaceAll('\r\n', '\n')
  const marker = '      - name: Summary\n        run: |\n'
  const start = workflow.indexOf(marker)

  expect(start).toBeGreaterThanOrEqual(0)

  let script = workflow
    .slice(start + marker.length)
    .split('\n')
    .map(line => line.slice(10))
    .join('\n')

  for (const [name, expression] of Object.entries(outputExpressions)) {
    script = script.replaceAll(expression, String(counts[name as keyof AuditorCounts]))
  }

  return script
}

function bashExecutable(): string {
  const gitBash = String.raw`C:\Program Files\Git\bin\bash.exe`
  return process.platform === 'win32' && existsSync(gitBash) ? gitBash : 'bash'
}

function runSummary(counts: AuditorCounts): { log: string; summary: string } {
  const directory = mkdtempSync(join(tmpdir(), 'sfl-auditor-summary-'))
  temporaryDirectories.push(directory)
  const summaryPath = join(directory, 'summary.md')
  const result = spawnSync(bashExecutable(), ['-s'], {
    input: summaryScript(counts),
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
  })

  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)

  return {
    log: result.stdout,
    summary: readFileSync(summaryPath, 'utf8'),
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('SFL Auditor summary', () => {
  it('publishes a valid zero-discrepancy table while retaining the step log', () => {
    const result = runSummary({
      conflicting: 0,
      duplicates: 0,
      orphanedLabels: 0,
      orphanedPrs: 0,
      paused: 0,
      prFallbacks: 0,
      staleUnclaimed: 0,
      stalledPrs: 0,
    })

    expect(result.summary).toBe(result.log)
    expect(result.summary).toBe(`## SFL Auditor Summary

| Check | Count |
|-------|-------|
| Orphaned in-progress labels fixed | 0 |
| PR fallback issues closed | 0 |
| Duplicate action-item issues closed | 0 |
| Conflicting labels fixed | 0 |
| Orphaned agent PRs flagged | 0 |
| Stale unclaimed issues flagged | 0 |
| Stalled draft PRs flagged | 0 |
| Unexplained pauses flagged | 0 |

All checks passed — no discrepancies found.
`)
  })

  it('publishes a valid nonzero-discrepancy table while retaining the step log', () => {
    const result = runSummary({
      conflicting: 0,
      duplicates: 2,
      orphanedLabels: 1,
      orphanedPrs: 0,
      paused: 0,
      prFallbacks: 0,
      staleUnclaimed: 0,
      stalledPrs: 1,
    })

    expect(result.summary).toBe(result.log)
    expect(result.summary).toBe(`## SFL Auditor Summary

| Check | Count |
|-------|-------|
| Orphaned in-progress labels fixed | 1 |
| PR fallback issues closed | 0 |
| Duplicate action-item issues closed | 2 |
| Conflicting labels fixed | 0 |
| Orphaned agent PRs flagged | 0 |
| Stale unclaimed issues flagged | 0 |
| Stalled draft PRs flagged | 1 |
| Unexplained pauses flagged | 0 |

Found and addressed 4 discrepancies.
`)
  })
})
