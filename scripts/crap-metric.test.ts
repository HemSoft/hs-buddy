import { describe, expect, it } from 'vitest'
import { crapScore, measureFunctions, type FileCoverage } from './crap-metric'
import { withoutCoverageIgnores } from './crap-source'

const loc = (start: number, end: number) => ({
  start: { line: 1, column: start },
  end: { line: 1, column: end },
})
function coverage(source: string, hits: number[], invoked = 1): FileCoverage {
  const start = source.indexOf('{')
  return {
    fnMap: { 0: { name: 'choose', loc: loc(start, source.length) } },
    f: { 0: invoked },
    statementMap: {},
    s: {},
    branchMap: {
      0: {
        loc: loc(source.indexOf('if'), source.length - 1),
        locations: [loc(start + 1, start + 2), loc(start + 2, start + 3)],
      },
    },
    b: { 0: hits },
  }
}

describe('per-function CRAP arithmetic and evidence', () => {
  const source = 'function choose(x: boolean) { if (x) return 1; return 0; }'
  it.each([
    [0, 6],
    [0.5, 2.5],
    [1, 2],
  ])('uses coverage %s for one function', (ratio, expected) => {
    expect(crapScore(2, ratio)).toBe(expected)
  })
  it('calculates partial branch coverage from the matching function', () => {
    const [row] = measureFunctions(source, coverage(source, [1, 0]))
    expect(row).toMatchObject({
      name: "Function 'choose'",
      complexity: 2,
      coverage: 0.5,
      covered: 1,
      total: 2,
      score: 2.5,
    })
  })
  it('treats an uncalled function as uncovered even with inconsistent positive branch hits', () => {
    expect(measureFunctions(source, coverage(source, [1, 1], 0))[0].score).toBe(6)
  })
  it('rejects absent or malformed evidence', () => {
    expect(() => measureFunctions(source, undefined)).toThrow('Missing matching')
    expect(() => measureFunctions(source, coverage(source, [1]))).toThrow('Invalid branch')
    expect(() => measureFunctions(source, coverage(source, [NaN, 1]))).toThrow('Invalid coverage')
  })
  it('does not let inline ESLint directives disable metric collection', () => {
    const code = '// eslint-disable\n' + source
    const data = coverage(source, [1, 1])
    for (const entry of Object.values(data.fnMap)) {
      entry.loc.start.line++
      entry.loc.end.line++
    }
    for (const entry of Object.values(data.branchMap)) {
      entry.loc.start.line++
      entry.loc.end.line++
    }
    expect(measureFunctions(code, data)[0].complexity).toBe(2)
  })
})

describe('coverage directive neutralization', () => {
  it('changes comment directives without moving source locations or changing strings', () => {
    const source =
      '/* v8 ignore next */\nconst a = "v8 ignore next"; // istanbul ignore next\nconst b = () => 1'
    const result = withoutCoverageIgnores(source, 'fixture.ts')
    expect(result).toBe(
      '/* xx ignore next */\nconst a = "v8 ignore next"; // xxxxxxxx ignore next\nconst b = () => 1'
    )
    expect(result.length).toBe(source.length)
  })
})
