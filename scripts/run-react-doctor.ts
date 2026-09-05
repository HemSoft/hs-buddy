import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateReactDoctorReport } from './react-doctor-report'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const packageRoot = resolve(dirname(require.resolve('react-doctor')), '..')
const { version } = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
  version: string
}
const reportDirectory = resolve(root, 'reports/react-doctor')
mkdirSync(reportDirectory, { recursive: true })
const result = spawnSync(
  'node',
  [resolve(packageRoot, 'bin/react-doctor.js'), '.', '--yes', '--json', '--no-score'],
  {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, REACT_DOCTOR_NO_TELEMETRY: '1', REACT_DOCTOR_NO_CACHE: '1' },
  }
)
writeFileSync(resolve(reportDirectory, 'report.json'), result.stdout ?? '')
writeFileSync(resolve(reportDirectory, 'stderr.txt'), result.stderr ?? '')
try {
  if (result.error) throw result.error
  const diagnostics = validateReactDoctorReport(JSON.parse(result.stdout), version)
  for (const diagnostic of diagnostics) console.error(diagnostic)
  if (diagnostics.length > 0) throw new Error(`${diagnostics.length} unsuppressed diagnostic(s)`)
  if (result.status !== 0) throw new Error(`React Doctor exited with ${result.status}`)
  console.log(
    `React Doctor ${version}: Score 100/100, zero diagnostics. Report: reports/react-doctor/report.json`
  )
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
