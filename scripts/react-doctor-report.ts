function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a React Doctor report object')
  }
  return value as Record<string, unknown>
}

function rejectSkippedChecks(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (
      ['skippedChecks', 'skippedCheckReasons'].includes(key) &&
      child &&
      (typeof child !== 'object' || Object.keys(child).length > 0)
    )
      throw new Error(`React Doctor skipped checks: ${JSON.stringify(child)}`)
    rejectSkippedChecks(child)
  }
}

function validateScan(report: Record<string, unknown>, version: string): void {
  if (report.schemaVersion !== 3 || report.version !== version) {
    throw new Error('Unexpected React Doctor schema or version')
  }
  if (
    report.ok !== true ||
    report.error ||
    report.mode !== 'full' ||
    report.reactDetected !== true
  ) {
    throw new Error('React Doctor did not complete a full React scan')
  }
  rejectSkippedChecks(report)
}

/** Fail closed on an incomplete scan or any unsuppressed error or warning. */
export function validateReactDoctorReport(value: unknown, version: string): string[] {
  const report = record(value)
  validateScan(report, version)
  if (!Array.isArray(report.projects) || report.projects.length !== 1) {
    throw new Error('Expected exactly one scanned repository project')
  }
  const project = record(report.projects[0])
  if (project.complete !== true || !(Number(project.scannedFileCount) > 0)) {
    throw new Error('React Doctor project scan is incomplete or empty')
  }
  if (!Array.isArray(report.diagnostics) || !Array.isArray(project.diagnostics)) {
    throw new Error('React Doctor diagnostics must be arrays')
  }
  const summary = record(report.summary)
  if (
    summary.totalDiagnosticCount !== report.diagnostics.length ||
    project.diagnostics.length !== report.diagnostics.length
  ) {
    throw new Error('React Doctor diagnostic counts disagree')
  }
  return report.diagnostics.map(value => {
    const diagnostic = record(value)
    if (
      typeof diagnostic.rule !== 'string' ||
      typeof diagnostic.filePath !== 'string' ||
      !Number.isInteger(diagnostic.line) ||
      !['error', 'warning'].includes(String(diagnostic.severity))
    ) {
      throw new Error('Malformed React Doctor diagnostic')
    }
    return `${diagnostic.filePath}:${diagnostic.line} ${diagnostic.plugin}/${diagnostic.rule}: ${diagnostic.message}`
  })
}
