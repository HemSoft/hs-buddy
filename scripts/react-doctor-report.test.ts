import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateReactDoctorReport } from './react-doctor-report'

function cleanReport() {
  return {
    schemaVersion: 3,
    version: '0.9.13',
    ok: true,
    error: null,
    mode: 'full',
    reactDetected: true,
    projects: [
      { complete: true, scannedFileCount: 10, skippedChecks: [], diagnostics: [] as unknown[] },
    ],
    diagnostics: [] as unknown[],
    summary: { totalDiagnosticCount: 0 },
  }
}

describe('React Doctor gate', () => {
  it('accepts a complete zero-diagnostic report', () => {
    expect(validateReactDoctorReport(cleanReport(), '0.9.13')).toEqual([])
  })

  it.each(['error', 'warning'])('reports a new %s with its current-schema location', severity => {
    const report = cleanReport()
    report.diagnostics = [
      {
        plugin: 'react-hooks',
        rule: 'refs',
        severity,
        filePath: 'src/Probe.tsx',
        line: 5,
        message: 'Render-phase ref write',
      },
    ]
    report.projects[0].diagnostics = report.diagnostics
    report.summary.totalDiagnosticCount = 1
    expect(validateReactDoctorReport(report, '0.9.13')).toEqual([
      'src/Probe.tsx:5 react-hooks/refs: Render-phase ref write',
    ])
  })

  it.each([
    { schemaVersion: 2 },
    { version: '0.5.8' },
    { ok: false },
    { error: 'scan failed' },
    { mode: 'diff' },
    { reactDetected: false },
    { projects: [] },
    { diagnostics: null },
    { summary: { totalDiagnosticCount: 1 } },
    { projects: [{ complete: false, scannedFileCount: 10, diagnostics: [] }] },
    { projects: [{ complete: true, scannedFileCount: 0, diagnostics: [] }] },
    { projects: [{ complete: true, scannedFileCount: 10, diagnostics: null }] },
    { projects: [{ complete: true, scannedFileCount: 10, diagnostics: [{}] }] },
    {
      projects: [
        { complete: true, scannedFileCount: 10, diagnostics: [], skippedChecks: ['lint'] },
      ],
    },
    { skippedCheckReasons: { lint: 'failed' } },
  ])('rejects incomplete or incompatible reports: %j', override => {
    expect(() => validateReactDoctorReport({ ...cleanReport(), ...override }, '0.9.13')).toThrow()
  })
})

describe('React Doctor malformed fields and CI wiring', () => {
  it('rejects malformed diagnostics instead of losing rule names', () => {
    const report = cleanReport()
    report.diagnostics = [{ ruleId: 'old-schema' }]
    report.projects[0].diagnostics = report.diagnostics
    report.summary.totalDiagnosticCount = 1
    expect(() => validateReactDoctorReport(report, '0.9.13')).toThrow('Malformed')
    expect(() => validateReactDoctorReport(null, '0.9.13')).toThrow()
  })

  it.each([true, '10', 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a non-positive-integer scan count: %s',
    scannedFileCount => {
      const report = {
        ...cleanReport(),
        projects: [{ complete: true, scannedFileCount, diagnostics: [] }],
      }
      expect(() => validateReactDoctorReport(report, '0.9.13')).toThrow('incomplete or empty')
    }
  )

  it.each(['plugin', 'message'])('rejects missing diagnostic %s', field => {
    const report = cleanReport()
    const diagnostic: Record<string, unknown> = {
      rule: 'refs',
      plugin: 'react-hooks',
      message: 'Ref write',
      severity: 'error',
      filePath: 'src/Probe.tsx',
      line: 4,
    }
    delete diagnostic[field]
    report.diagnostics = [diagnostic]
    report.projects[0].diagnostics = report.diagnostics
    report.summary.totalDiagnosticCount = 1
    expect(() => validateReactDoctorReport(report, '0.9.13')).toThrow('Malformed')
  })

  it('requires both platforms and includes the job in final CI qualification', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
    const job = workflow.split('  react-doctor:')[1].split('  typecheck:')[0]
    expect(job).toContain('os: [ubuntu-latest, windows-latest]')
    expect(job).toContain('run: bun run react-doctor')
    expect(job).toContain('if: always()')
    expect(job).toContain('if-no-files-found: error')
    expect(job).not.toContain('continue-on-error')
    expect(workflow.split('  ci-complete:')[1]).toContain(
      'needs: [ci-feedback, test-electron-memory, react-doctor]'
    )
  })
})
