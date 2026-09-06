import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/benchmarks.yml', 'utf8')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')

describe('Benchmarks workflow', () => {
  it('runs through CI on pull requests and main, plus standalone manual dispatch', () => {
    expect(workflow).toContain('  workflow_call:')
    expect(workflow).toContain('  workflow_dispatch:')
    expect(ci).toContain('  pull_request:')
    expect(ci).toMatch(/push:\r?\n {4}branches: \[main\]/)
    expect(ci).toContain('uses: ./.github/workflows/benchmarks.yml')
    const dependencies = ci
      .split('  ci-complete:')[1]
      .match(/needs: \[([^\]]+)\]/)?.[1]
      .split(',')
      .map(value => value.trim())
    expect(dependencies).toContain('benchmarks')
  })
  it('classifies every PR before optional expensive steps and records skip evidence', () => {
    expect(workflow).toContain('run: bun scripts/bench-policy.ts')
    expect(workflow).toContain("if: steps.policy.outputs.mode != 'skip'")
    expect(workflow).toContain('bench-policy.json')
    expect(workflow).toContain(
      'tee "$GITHUB_WORKSPACE/bench-summary.md" | tee -a "$GITHUB_STEP_SUMMARY"'
    )
    expect(workflow).toContain('if: always()')
    expect(workflow).not.toContain('paths-ignore:')
    expect(workflow).not.toContain('continue-on-error:')
  })
  it('interleaves three samples, alternates first revision, and retains the 15-minute budget', () => {
    expect(workflow).toContain('for run in 1 2 3; do')
    expect(workflow).toContain('order="baseline candidate"')
    expect(workflow).toContain('order="candidate baseline"')
    expect(workflow).toContain('bunx vitest bench --run --outputJson')
    expect(workflow).toContain('timeout-minutes: 15')
    expect(workflow).toContain('run: bun scripts/bench-qualify.ts')
  })
})
