import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface StrykerConfig {
  coverageAnalysis: string
  ignoreStatic: boolean
  thresholds: { break: number }
}

const runnerSource = resolve('node_modules/@stryker-mutator/vitest-runner/dist/src')

const runtimeCopies = ['test-helpers.js', 'stryker-setup.js']

describe('Stryker Vitest 5 compatibility', () => {
  it('patches both runtime copies of the nested test-name collector', () => {
    for (const file of runtimeCopies) {
      expect(readFileSync(resolve(runnerSource, file), 'utf8')).toContain(
        "return nameParts.join(' > ').trim();"
      )
    }
  })

  it('uses Vitest 5 nested test names in the patched helper', async () => {
    const helperUrl = pathToFileURL(resolve(runnerSource, 'test-helpers.js')).href
    const { collectTestName } = (await import(helperUrl)) as {
      collectTestName: (test: unknown) => string
    }

    const test = {
      name: 'kills the mutant',
      suite: { name: 'inner suite', suite: { name: 'outer suite' } },
    }

    expect(collectTestName(test)).toBe('outer suite > inner suite > kills the mutant')
  })

  it('keeps per-test analysis and the existing break threshold enabled', () => {
    const config = JSON.parse(readFileSync('stryker.config.json', 'utf8')) as StrykerConfig

    expect(config.coverageAnalysis).toBe('perTest')
    expect(config.ignoreStatic).toBe(true)
    expect(config.thresholds.break).toBe(96.5)
  })
})
