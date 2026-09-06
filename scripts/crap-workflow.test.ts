import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ci = readFileSync('.github/workflows/ci.yml', 'utf8')

describe('required CRAP qualification', () => {
  it('requires successful coverage for all maintained suites and blocks ci-complete', () => {
    const collection = ci.split('  crap-coverage:')[1].split('  crap:')[0]
    expect(collection).toContain('suite: [renderer, electron, convex]')
    expect(collection).toContain('run: bun run crap:coverage ${{ matrix.suite }}')
    const gate = ci.split('  crap:')[1].split('  ci-complete:')[0]
    expect(gate).toContain('needs: [crap-coverage]')
    expect(gate).toContain('test "$COVERAGE_RESULT" = success')
    expect(gate).toContain('bun run crap')
    expect(gate).toContain('if: always()')
    expect(gate).toContain('path: reports/crap/report.json')
    expect(gate).not.toContain('continue-on-error:')
    const dependencies = ci
      .split('  ci-complete:')[1]
      .match(/needs: \[([^\]]+)\]/)?.[1]
      .split(',')
      .map(value => value.trim())
    expect(dependencies).toContain('crap')
  })
  it('replaces the file-level approximation with the authoritative command', () => {
    const script = readFileSync('scripts/whats-next.ps1', 'utf8')
    expect(script).toContain("-Command 'bun run crap:check'")
    expect(script).not.toContain('coverageIsPerfect')
    expect(script).not.toContain('All functions covered and complexity <= 5')
  })
})
