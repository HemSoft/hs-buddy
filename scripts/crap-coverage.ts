import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { CRAP_SUITES, sourceFingerprint, type CrapSuite } from './crap-scope'

const requested = process.argv.slice(2)
const suites = requested.length ? requested : CRAP_SUITES
for (const name of suites) {
  if (!CRAP_SUITES.includes(name as CrapSuite)) throw new Error(`Unknown CRAP suite: ${name}`)
  const suite = name as CrapSuite
  const fingerprint = sourceFingerprint(suite)
  const directory = `reports/crap/coverage-${suite}`
  mkdirSync(directory, { recursive: true })
  rmSync(`${directory}/source.json`, { force: true })
  const result = spawnSync(
    'bunx',
    ['vitest', 'run', '--config', 'vitest.crap.config.ts', '--coverage'],
    {
      stdio: 'inherit',
      env: { ...process.env, CRAP_SUITE: suite },
    }
  )
  if (result.error || result.status !== 0)
    throw new Error(`CRAP coverage failed for ${suite}: ${result.error ?? result.status}`)
  if (fingerprint !== sourceFingerprint(suite))
    throw new Error(`Sources changed during coverage for ${suite}`)
  writeFileSync(`${directory}/source.json`, JSON.stringify({ suite, fingerprint }, null, 2) + '\n')
}
