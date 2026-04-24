import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatDistanceToNow,
  format,
  formatDateFull,
  formatDateCompact,
  formatDuration,
  formatSecondsCountdown,
  formatUptime,
  formatTime,
  formatHour12,
} from './dateUtils'

describe('formatDistanceToNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for timestamps less than 1 minute ago', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now)).toBe('just now')
    expect(formatDistanceToNow(now - 30_000)).toBe('just now')
  })

  it('formats minutes ago', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now - 60_000)).toBe('1 minute ago')
    expect(formatDistanceToNow(now - 5 * 60_000)).toBe('5 minutes ago')
  })

  it('formats hours and minutes ago', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now - 2 * 3_600_000 - 15 * 60_000)).toBe(
      '2 hours and 15 minutes ago'
    )
  })

  it('formats single hour ago without minutes when exact', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now - 3_600_000)).toBe('1 hour ago')
  })

  it('formats days ago', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now - 3 * 86_400_000)).toBe('3 days ago')
  })

  it('formats days and hours ago with at most two parts', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now - 2 * 86_400_000 - 5 * 3_600_000 - 10 * 60_000)).toBe(
      '2 days and 5 hours ago'
    )
  })

  it('formats weeks ago', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now - 7 * 86_400_000)).toBe('1 week ago')
    expect(formatDistanceToNow(now - 14 * 86_400_000)).toBe('2 weeks ago')
  })

  it('formats months ago', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now - 30 * 86_400_000)).toBe('1 month ago')
    expect(formatDistanceToNow(now - 60 * 86_400_000)).toBe('2 months ago')
  })

  it('accepts a Date object', () => {
    const now = Date.now()
    expect(formatDistanceToNow(new Date(now - 120_000))).toBe('2 minutes ago')
  })

  it('accepts an ISO string', () => {
    expect(formatDistanceToNow('2026-06-15T11:55:00.000Z')).toBe('5 minutes ago')
  })

  it('returns "just now" for future timestamps', () => {
    const now = Date.now()
    expect(formatDistanceToNow(now + 60_000)).toBe('just now')
    expect(formatDistanceToNow(now + 3_600_000)).toBe('just now')
  })

  it('returns empty string for invalid values', () => {
    expect(formatDistanceToNow('not-a-date')).toBe('')
    expect(formatDistanceToNow(NaN)).toBe('')
  })
})

describe('format', () => {
  const date = new Date(2026, 5, 5, 14, 3, 7)

  it('formats year tokens', () => {
    expect(format(date, 'yyyy')).toBe('2026')
    expect(format(date, 'yy')).toBe('26')
  })

  it('formats month tokens', () => {
    expect(format(date, 'MMMM')).toBe('June')
    expect(format(date, 'MMM')).toBe('Jun')
    expect(format(date, 'MM')).toBe('06')
    expect(format(date, 'M')).toBe('6')
  })

  it('formats day tokens', () => {
    expect(format(date, 'dd')).toBe('05')
    expect(format(date, 'd')).toBe('5')
  })

  it('formats 24-hour and 12-hour tokens', () => {
    expect(format(date, 'HH')).toBe('14')
    expect(format(date, 'H')).toBe('14')
    expect(format(date, 'hh')).toBe('02')
    expect(format(date, 'h')).toBe('2')
  })

  it('formats minute and second tokens', () => {
    expect(format(date, 'mm')).toBe('03')
    expect(format(date, 'm')).toBe('3')
    expect(format(date, 'ss')).toBe('07')
    expect(format(date, 's')).toBe('7')
  })

  it('formats meridiem tokens', () => {
    expect(format(date, 'A')).toBe('PM')
    expect(format(date, 'a')).toBe('pm')
  })

  it('handles combined format strings', () => {
    expect(format(date, 'yyyy-MM-dd HH:mm:ss')).toBe('2026-06-05 14:03:07')
    expect(format(date, 'h:mm A')).toBe('2:03 PM')
    expect(format(date, 'yyyy-MM-d')).toBe('2026-06-5')
  })

  it('does not corrupt month names containing format-token characters', () => {
    // March contains 'a' (ampm token) and 'M' (month number token)
    const march = new Date(2026, 2, 15, 14, 30, 0)
    expect(format(march, 'MMMM d, yyyy')).toBe('March 15, 2026')
    expect(format(march, 'MMM d, yyyy h:mm a')).toBe('Mar 15, 2026 2:30 pm')

    // May contains 'a' and 'M'
    const may = new Date(2026, 4, 1, 9, 5, 0)
    expect(format(may, 'MMMM d, yyyy')).toBe('May 1, 2026')

    // September contains 's' (seconds token)
    const september = new Date(2026, 8, 20, 8, 0, 0)
    expect(format(september, 'MMMM d')).toBe('September 20')

    // December contains 'd' (day token)
    const december = new Date(2026, 11, 25, 12, 0, 0)
    expect(format(december, 'MMMM dd, yyyy')).toBe('December 25, 2026')
  })

  it('accepts numeric timestamps', () => {
    expect(format(date.getTime(), 'yyyy')).toBe('2026')
  })

  it('formats midnight in 12-hour time', () => {
    const midnight = new Date(2026, 0, 1, 0, 0, 0)
    expect(format(midnight, 'h:mm A')).toBe('12:00 AM')
  })
})

describe('formatDateFull', () => {
  it('returns "N/A" for nullish values', () => {
    expect(formatDateFull(null)).toBe('N/A')
    expect(formatDateFull(undefined)).toBe('N/A')
  })

  it('returns a non-empty string for valid dates', () => {
    expect(formatDateFull('2026-06-15T12:00:00Z')).toBeTruthy()
    expect(formatDateFull(Date.now())).toBeTruthy()
  })
})

describe('formatDateCompact', () => {
  it('returns "—" for nullish values', () => {
    expect(formatDateCompact(null)).toBe('—')
    expect(formatDateCompact(undefined)).toBe('—')
  })

  it('returns a non-empty string for valid dates', () => {
    expect(formatDateCompact('2026-01-15T08:30:00Z')).toBeTruthy()
    expect(formatDateCompact(1_750_000_000_000)).toBeTruthy()
  })
})

describe('formatDuration', () => {
  it('formats milliseconds under one second', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('formats seconds under one minute', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(59_999)).toBe('60.0s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(60_000)).toBe('1m 0s')
    expect(formatDuration(90_000)).toBe('1m 30s')
    expect(formatDuration(125_000)).toBe('2m 5s')
    expect(formatDuration(3_600_000)).toBe('60m 0s')
  })

  it('never produces 60s (normalizes to next minute)', () => {
    expect(formatDuration(119_999)).toBe('2m 0s')
  })
})

describe('formatSecondsCountdown', () => {
  it('returns "now" for non-positive values', () => {
    expect(formatSecondsCountdown(0)).toBe('now')
    expect(formatSecondsCountdown(-5)).toBe('now')
  })

  it('formats seconds only', () => {
    expect(formatSecondsCountdown(45)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatSecondsCountdown(125)).toBe('2m 05s')
    expect(formatSecondsCountdown(60)).toBe('1m 00s')
  })
})

describe('formatUptime', () => {
  it('formats non-positive durations as zero seconds', () => {
    expect(formatUptime(0)).toBe('0s')
    expect(formatUptime(-1)).toBe('0s')
  })

  it('formats seconds and minutes', () => {
    expect(formatUptime(1_000)).toBe('1s')
    expect(formatUptime(59_000)).toBe('59s')
    expect(formatUptime(60_000)).toBe('1m')
    expect(formatUptime(59 * 60_000)).toBe('59m')
  })

  it('formats hours with optional minutes', () => {
    expect(formatUptime(60 * 60_000)).toBe('1h')
    expect(formatUptime(90 * 60_000)).toBe('1h 30m')
  })

  it('formats days with optional remaining hours', () => {
    expect(formatUptime(24 * 60 * 60_000)).toBe('1d')
    expect(formatUptime(27 * 60 * 60_000)).toBe('1d 3h')
  })
})

describe('formatTime', () => {
  const sampleDate = new Date(2026, 5, 15, 14, 30, 45)

  it('returns a non-empty string for a Date object and timestamp', () => {
    expect(formatTime(sampleDate)).toBeTruthy()
    expect(formatTime(sampleDate.getTime())).toBeTruthy()
  })

  it('supports seconds output', () => {
    const result = formatTime(sampleDate, { seconds: true })
    expect(result).toBeTruthy()
  })

  it('supports both 12-hour and 24-hour output', () => {
    const hour12 = formatTime(sampleDate, { hour12: true })
    const hour24 = formatTime(sampleDate, { hour12: false })

    expect(hour12).toBeTruthy()
    expect(hour24).toBeTruthy()
    expect(hour12).not.toBe(hour24)
  })

  it('supports numeric hour formatting', () => {
    expect(formatTime(sampleDate, { numeric: true })).toBeTruthy()
  })
})

describe('formatHour12', () => {
  it('formats midnight and morning hours', () => {
    expect(formatHour12(0)).toBe('12 AM')
    expect(formatHour12(1)).toBe('1 AM')
    expect(formatHour12(6)).toBe('6 AM')
    expect(formatHour12(11)).toBe('11 AM')
  })

  it('formats noon and afternoon hours', () => {
    expect(formatHour12(12)).toBe('12 PM')
    expect(formatHour12(13)).toBe('1 PM')
    expect(formatHour12(18)).toBe('6 PM')
    expect(formatHour12(23)).toBe('11 PM')
  })
})
