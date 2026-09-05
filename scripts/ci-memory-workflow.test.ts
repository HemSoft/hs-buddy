import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n')
function stepScript(name: string): string {
  const start = workflow.indexOf(`      - name: ${name}\n`)
  if (start < 0) throw new Error(`Missing workflow step ${name}`)
  const block = workflow.slice(start).split('\n      - name:')[0]
  const script = `${block}\n`.match(/ {8}run: \|\n((?: {10}.*\n|\n)+)/)?.[1]
  if (!script) throw new Error(`Missing script for ${name}`)
  return script
    .split('\n')
    .map(line => line.slice(10))
    .join('\n')
}
function runGate(name: string, env: Record<string, string>) {
  const windowsBash = String.raw`C:\Program Files\Git\bin\bash.exe`
  const bash = process.platform === 'win32' && existsSync(windowsBash) ? windowsBash : 'bash'
  return spawnSync(bash, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', stepScript(name)], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10000,
  })
}

describe('CI qualification gates', () => {
  it.each([
    ['success', 'run', 'success', 0],
    ['success', 'skip', 'skipped', 0],
    ['success', 'run', 'skipped', 1],
    ['success', 'run', 'failure', 1],
    ['success', 'run', 'cancelled', 1],
    ['success', 'defer', 'skipped', 1],
    ['success', 'skip', 'failure', 1],
    ['failure', 'skip', 'skipped', 1],
    ['cancelled', 'skip', 'skipped', 1],
    ['success', '', 'skipped', 1],
  ])('enforces policy %s / %s / %s', (policy, mode, samples, expected) => {
    const result = runGate('Validate qualification policy and sample jobs', {
      POLICY_RESULT: policy,
      MODE: mode,
      SAMPLES_RESULT: samples,
    })
    expect(result.status, result.stderr).toBe(expected)
  })
  it.each(['Check fast feedback jobs', 'Check final qualification'])(
    '%s rejects failure, cancellation, and unexpected skips',
    name => {
      for (const state of ['failure', 'cancelled', 'skipped']) {
        expect(
          runGate(name, {
            RESULTS: JSON.stringify({ a: { result: 'success' }, b: { result: state } }),
          }).status
        ).toBe(1)
      }
      expect(runGate(name, { RESULTS: JSON.stringify({ a: { result: 'success' } }) }).status).toBe(
        0
      )
    }
  )
})
