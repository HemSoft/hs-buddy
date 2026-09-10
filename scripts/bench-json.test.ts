import { describe, expect, it } from 'vitest'
import { benchmarkJsonArgs } from './bench-json'

describe('benchmarkJsonArgs', () => {
  it('uses the legacy benchmark writer for a Vitest 4 comparison base', () => {
    expect(benchmarkJsonArgs(4, '/tmp/base.json')).toEqual([
      'vitest',
      'bench',
      '--run',
      '--outputJson',
      '/tmp/base.json',
    ])
  })

  it('uses the JSON reporter for Vitest 5', () => {
    expect(benchmarkJsonArgs(5, '/tmp/candidate.json')).toEqual([
      'vitest',
      'bench',
      '--run',
      '--reporter=json',
      '--outputFile=/tmp/candidate.json',
    ])
  })

  it('rejects unknown Vitest majors', () => {
    expect(() => benchmarkJsonArgs(6, '/tmp/result.json')).toThrow('Unsupported Vitest major: 6')
  })
})
