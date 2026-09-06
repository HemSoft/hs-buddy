import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { sourceCoverage } from './crap-instrumenter'
import { measureFunctions, type FileCoverage } from './crap-metric'
import { baselineFor, crapFailures } from './crap-policy'

function collect(source: string, execute: string) {
  const filename = resolve('src/crap-fixture.ts')
  const collector = sourceCoverage(['src'])
  const bridge = collector.instrumenter({
    coverageVariable: '__crap',
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
    ignoreClassMethods: [],
  })
  const transform = collector.plugin.transform as (
    code: string,
    path: string
  ) => { code: string; map: string }
  const transformed = transform(source, filename)
  expect(bridge.instrumentSync(transformed.code, filename)).toBe(transformed.code)
  const context: { __crap?: Record<string, FileCoverage> } = {}
  runInNewContext(transformed.code + '\n' + execute, context)
  return measureFunctions(source, context.__crap![filename])
}

describe('original TypeScript coverage identity', () => {
  it('distinguishes two functions in one file with different coverage', () => {
    const rows = collect(
      'function full(x) { if(x) return 1; return 0 }\nfunction partial(x) { if(x) return 1; return 0 }',
      'full(true); full(false); partial(true)'
    )
    expect(rows.map(row => [row.complexity, row.coverage, row.score])).toEqual([
      [2, 1, 2],
      [2, 0.5, 2.5],
    ])
  })
  it('separates nested returned callbacks from their fully covered parent', () => {
    const rows = collect('const outer = () => () => { if (true) return 1; return 0 }', 'outer()')
    expect(rows.map(row => [row.complexity, row.coverage, row.score])).toEqual([
      [1, 1, 1],
      [2, 0, 6],
    ])
  })
  it('includes ignored, anonymous and never-called functions', () => {
    const rows = collect(
      '/* istanbul ignore next */\nconst ignored = function(x) { if(x) return 1; return 0 };\nconst arrow = x => x ? 1 : 0',
      'arrow(true)'
    )
    expect(rows.map(row => [row.coverage, row.score])).toEqual([
      [0, 6],
      [0.5, 2.5],
    ])
  })
  it('makes an uncovered complex fixture fail the maintained threshold', () => {
    const rows = collect(
      'function risky(a,b,c,d) { if(a) return 1; if(b) return 2; if(c) return 3; if(d) return 4; return 0 }',
      ''
    )
    expect(rows[0]).toMatchObject({
      name: "Function 'risky'",
      complexity: 5,
      coverage: 0,
      score: 30,
    })
    expect(
      crapFailures(
        rows.map(row => ({ file: 'src/fixture.ts', ...row })),
        baselineFor([], 'a'.repeat(40))
      )
    ).toHaveLength(1)
  })
  it('keeps function identity when an identical callback is inserted in another context', () => {
    const source = 'const target = x => x ? 1 : 0'
    const original = collect(source, 'target(true)')
    const inserted = collect('const other = x => x ? 1 : 0; ' + source, 'target(true)')
    expect(inserted[1].id).toBe(original[0].id)
    expect(inserted[0].id).not.toBe(original[0].id)
  })
  it('keeps TypeScript generic arrows distinct from JSX parsing', () => {
    const collector = sourceCoverage(['src'])
    collector.instrumenter({
      coverageVariable: '__crap',
      coverageGlobalScope: 'globalThis',
      coverageGlobalScopeFunc: false,
      ignoreClassMethods: [],
    })
    const transform = collector.plugin.transform as (code: string, path: string) => { code: string }
    expect(
      transform('const identity = <T,>(value: T) => value', resolve('src/generic.ts')).code
    ).toContain('identity')
  })
})
