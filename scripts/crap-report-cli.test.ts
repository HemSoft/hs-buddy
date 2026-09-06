import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CRAP coverage failure diagnostics', () => {
  it.each(['failure', 'cancelled'])(
    'preserves an explicit report when collection is %s',
    status => {
      const directory = mkdtempSync(join(tmpdir(), 'crap-report-failure-'))
      try {
        const result = spawnSync('bun', [resolve('scripts/crap-report.ts')], {
          cwd: directory,
          encoding: 'utf8',
          env: { ...process.env, COVERAGE_RESULT: status },
        })
        expect(result.status).toBe(1)
        const report = JSON.parse(readFileSync(join(directory, 'reports/crap/report.json'), 'utf8'))
        expect(report.error).toBe(`Coverage collection did not succeed: ${status}`)
        expect(result.stderr).toContain(report.error)
      } finally {
        rmSync(directory, { recursive: true })
      }
    }
  )
})
