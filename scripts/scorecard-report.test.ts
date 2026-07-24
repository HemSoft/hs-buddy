import { describe, expect, it } from 'vitest'
import { parseScorecardReport, scoreHistoryLine } from './scorecard-report'

function scorecardHtml(repository = 'HemSoft/hs-buddy'): string {
  return `<html><body><script id="scorecard-data" type="application/json">
    ${JSON.stringify({
      repository: { fullName: repository },
      classification: {
        level: 'Gold',
        numericScore: 100,
        maxPoints: 100,
        bronze: { passed: 7, total: 7, points: 30, maxPoints: 30 },
        silver: { passed: 8, total: 8, points: 35, maxPoints: 35 },
        gold: { passed: 6, total: 6, points: 35, maxPoints: 35 },
        score: { percent: 100, passed: 21, total: 21 },
      },
      rules: [{ passed: true }],
      linting: { totalErrors: 0, totalWarnings: 0 },
    })}
  </script></body></html>`
}

describe('parseScorecardReport', () => {
  it('accepts a report for the current repository without case sensitivity', () => {
    const report = parseScorecardReport(scorecardHtml('hemsoft/HS-BUDDY'), 'HemSoft/hs-buddy')

    expect(report.repository.fullName).toBe('hemsoft/HS-BUDDY')
    expect(report.classification.numericScore).toBe(100)
    expect(report.classification.score).toEqual({ percent: 100, passed: 21, total: 21 })
  })

  it('rejects a report attributed to another repository', () => {
    expect(() =>
      parseScorecardReport(scorecardHtml('relias-engineering/hs-buddy'), 'HemSoft/hs-buddy')
    ).toThrow(
      'Scorecard repository mismatch: report is for "relias-engineering/hs-buddy", current repository is "HemSoft/hs-buddy". Refusing to log or use this scorecard.'
    )
  })

  it('rejects a report with no repository identity', () => {
    const html = scorecardHtml().replace(
      '"repository":{"fullName":"HemSoft/hs-buddy"}',
      '"repository":{}'
    )

    expect(() => parseScorecardReport(html, 'HemSoft/hs-buddy')).toThrow(
      'Scorecard report is missing repository.fullName.'
    )
  })

  it('rejects HTML without scorecard data', () => {
    expect(() => parseScorecardReport('<html></html>', 'HemSoft/hs-buddy')).toThrow(
      'Could not find scorecard-data JSON script tag.'
    )
  })
})

describe('scoreHistoryLine', () => {
  it.each([
    ['standard time', '2026-01-15T17:10:18-05:00', new Date('2026-01-15T22:10:18Z')],
    ['daylight time', '2026-07-15T18:10:18-04:00', new Date('2026-07-15T22:10:18Z')],
  ])('uses the correct Eastern offset during %s', (_season, timestamp, date) => {
    const report = parseScorecardReport(scorecardHtml(), 'HemSoft/hs-buddy')

    expect(scoreHistoryLine(report, date)).toBe(
      `${timestamp} | 100/100 | Gold | Bronze: 30/30 (7/7) | Silver: 35/35 (8/8) | Gold: 35/35 (6/6)`
    )
  })
})
