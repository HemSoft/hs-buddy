import { describe, expect, test } from 'vitest'
import { parseE18eReport, requireSuccessfulAnalyzer } from './e18e-report'

const expected = { name: 'example', version: '1.0.0' }
const stats = {
  ...expected,
  dependencyCount: { production: 2, development: 3 },
  extraStats: [{ name: 'duplicateDependencyCount', value: 0 }],
}
const report = { stats, messages: [] }
const encode = (value: unknown) => JSON.stringify(value)

test('accepts a complete empty report and preserves duplicate counts', () => {
  expect(parseE18eReport(encode(report), expected)).toEqual({ messages: [], duplicateCount: 0 })
  expect(
    parseE18eReport(
      encode({
        ...report,
        stats: {
          ...stats,
          extraStats: [{ name: 'duplicateDependencyCount', value: 12 }],
        },
      }),
      expected
    ).duplicateCount
  ).toBe(12)
})

test.each(['error', 'warning', 'suggestion'])('accepts the pinned %s message schema', severity => {
  const message = { message: 'finding', severity, score: 1 }
  expect(parseE18eReport(encode({ ...report, messages: [message] }), expected).messages).toEqual([
    message,
  ])
})

describe('invalid reports fail closed', () => {
  test.each([
    ['empty output', ''],
    ['noise around JSON', `noise ${encode(report)}`],
    ['malformed JSON', '{'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a primitive', '23'],
    ['missing messages', encode({ stats })],
    ['non-array messages', encode({ stats, messages: {} })],
    ['missing statistics', encode({ messages: [] })],
    ['null statistics', encode({ messages: [], stats: null })],
    ['wrong name', encode({ ...report, stats: { ...stats, name: 'another-checkout' } })],
    ['wrong version', encode({ ...report, stats: { ...stats, version: '0.0.0' } })],
    [
      'missing dependency counts',
      encode({ ...report, stats: { ...stats, dependencyCount: null } }),
    ],
    ['missing extra statistics', encode({ ...report, stats: { ...stats, extraStats: undefined } })],
    ['missing duplicate count', encode({ ...report, stats: { ...stats, extraStats: [] } })],
    ['invalid extra statistic', encode({ ...report, stats: { ...stats, extraStats: [null] } })],
    [
      'ambiguous duplicate count',
      encode({
        ...report,
        stats: {
          ...stats,
          extraStats: [
            { name: 'duplicateDependencyCount', value: 0 },
            { name: 'duplicateDependencyCount', value: 0 },
          ],
        },
      }),
    ],
  ])('rejects %s', (_name, output) => {
    expect(() => parseE18eReport(output, expected)).toThrow()
  })
})

test.each([-1, 1.5, '3', null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid count %s', value => {
  for (const field of ['production', 'development']) {
    expect(() =>
      parseE18eReport(
        encode({
          ...report,
          stats: {
            ...stats,
            dependencyCount: { ...stats.dependencyCount, [field]: value },
          },
        }),
        expected
      )
    ).toThrow('dependency counts')
  }
  expect(() =>
    parseE18eReport(
      encode({
        ...report,
        stats: {
          ...stats,
          extraStats: [{ name: 'duplicateDependencyCount', value }],
        },
      }),
      expected
    )
  ).toThrow('duplicate dependency count')
})

test.each([
  null,
  [],
  {},
  { message: '' },
  { message: 1 },
  { message: 'finding', severity: 'unknown', score: 1 },
  { message: 'finding', severity: 'warning' },
  { message: 'finding', severity: 'warning', score: '1' },
  { message: 'finding', severity: 'warning', score: Infinity },
])('rejects malformed message %j', message => {
  expect(() => parseE18eReport(encode({ ...report, messages: [message] }), expected)).toThrow()
})

test('accepts only a successful unsignaled analyzer process', () => {
  expect(() => requireSuccessfulAnalyzer({ status: 0, signal: null })).not.toThrow()
  expect(() => requireSuccessfulAnalyzer({ status: 23, signal: null })).toThrow('exit=23')
  expect(() => requireSuccessfulAnalyzer({ status: null, signal: 'SIGTERM' })).toThrow('SIGTERM')
  expect(() => requireSuccessfulAnalyzer({ status: null, signal: null })).toThrow('exit=null')
  expect(() => requireSuccessfulAnalyzer({ status: 0, signal: 'SIGTERM' })).toThrow('SIGTERM')
  expect(() =>
    requireSuccessfulAnalyzer({ status: null, signal: null, error: new Error('ENOENT') })
  ).toThrow('ENOENT')
})
