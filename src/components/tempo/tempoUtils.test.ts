import { describe, expect, it } from 'vitest'
import type { TempoWorklog } from '../../types/tempo'
import { nextStartTime } from './tempoUtils'

function worklog(hours: number): TempoWorklog {
  return {
    id: 1,
    issueKey: 'TEST-1',
    issueSummary: 'Test issue',
    hours,
    date: '2026-03-26',
    startTime: '08:00',
    description: '',
    accountKey: 'DEV',
    accountName: 'Development',
  }
}

describe('nextStartTime', () => {
  it('returns 08:00 when there are no existing worklogs', () => {
    expect(nextStartTime([])).toBe('08:00')
  })

  it('offsets by a single 1-hour worklog', () => {
    expect(nextStartTime([worklog(1)])).toBe('09:00')
  })

  it('offsets by a single 1.5-hour worklog', () => {
    expect(nextStartTime([worklog(1.5)])).toBe('09:30')
  })

  it('offsets by a 0.25-hour worklog', () => {
    expect(nextStartTime([worklog(0.25)])).toBe('08:15')
  })

  it('sums multiple worklogs correctly', () => {
    expect(nextStartTime([worklog(2), worklog(3)])).toBe('13:00')
  })

  it('handles a full 8-hour workday', () => {
    expect(nextStartTime([worklog(8)])).toBe('16:00')
  })

  it('handles worklogs that reach end of business (10 hours)', () => {
    expect(nextStartTime([worklog(4), worklog(3), worklog(3)])).toBe('18:00')
  })

  it('handles a zero-hour worklog without changing the start time', () => {
    expect(nextStartTime([worklog(0)])).toBe('08:00')
  })

  it('wraps past midnight using modulo 24', () => {
    expect(nextStartTime([worklog(17)])).toBe('01:00')
  })

  it('returns 00:00 when worklogs exactly fill to midnight', () => {
    expect(nextStartTime([worklog(16)])).toBe('00:00')
  })

  it('handles many small worklogs', () => {
    const worklogs = [worklog(0.5), worklog(0.5), worklog(0.5), worklog(0.5)]

    expect(nextStartTime(worklogs)).toBe('10:00')
  })

  it('pads single-digit hours with a leading zero', () => {
    expect(nextStartTime([worklog(17)])).toMatch(/^0[0-9]:/)
  })
})
