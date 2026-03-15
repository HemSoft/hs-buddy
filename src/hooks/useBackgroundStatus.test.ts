import { describe, expect, it } from 'vitest'
import { getFriendlyTaskLabel, formatCountdown, formatAge } from './useBackgroundStatus'

describe('getFriendlyTaskLabel', () => {
  it('returns null for null input', () => {
    expect(getFriendlyTaskLabel(null)).toBeNull()
  })

  it('maps known task names', () => {
    expect(getFriendlyTaskLabel('my-prs')).toBe('My PRs')
    expect(getFriendlyTaskLabel('needs-review')).toBe('Needs Review')
    expect(getFriendlyTaskLabel('recently-merged')).toBe('Recently Merged')
    expect(getFriendlyTaskLabel('need-a-nudge')).toBe('Needs a nudge')
  })

  it('maps prefixed task names', () => {
    expect(getFriendlyTaskLabel('org-detail-overview-myorg')).toBe('Org Overview')
    expect(getFriendlyTaskLabel('org-detail-members-myorg')).toBe('Org Members')
    expect(getFriendlyTaskLabel('org-detail-copilot-myorg')).toBe('Org Copilot')
    expect(getFriendlyTaskLabel('refresh-org-myorg')).toBe('Organizations')
  })

  it('returns raw task name for unknown tasks', () => {
    expect(getFriendlyTaskLabel('some-custom-task')).toBe('some-custom-task')
  })
})

describe('formatCountdown', () => {
  it('returns "now" for zero', () => {
    expect(formatCountdown(0)).toBe('now')
  })

  it('returns "now" for negative', () => {
    expect(formatCountdown(-5)).toBe('now')
  })

  it('formats seconds only', () => {
    expect(formatCountdown(45)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatCountdown(125)).toBe('2m 05s')
  })

  it('pads seconds with leading zero', () => {
    expect(formatCountdown(63)).toBe('1m 03s')
  })

  it('formats exact minute boundary', () => {
    expect(formatCountdown(60)).toBe('1m 00s')
  })
})

describe('formatAge', () => {
  it('returns "just now" for under a minute', () => {
    expect(formatAge(30_000)).toBe('just now')
    expect(formatAge(0)).toBe('just now')
  })

  it('formats minutes', () => {
    expect(formatAge(120_000)).toBe('2m ago')
    expect(formatAge(3_540_000)).toBe('59m ago')
  })

  it('formats hours and minutes', () => {
    expect(formatAge(3_600_000)).toBe('1h 0m ago')
    expect(formatAge(5_400_000)).toBe('1h 30m ago')
    expect(formatAge(7_260_000)).toBe('2h 1m ago')
  })
})
