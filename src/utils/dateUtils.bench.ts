import { bench, describe } from 'vitest'
import {
  format,
  formatDateCompact,
  formatDateFull,
  formatDateKey,
  formatDistanceToNow,
  formatDuration,
  formatHour12,
  formatUptime,
} from './dateUtils'

const NOW = Date.now()
const ONE_HOUR_AGO = NOW - 3_600_000
const ONE_WEEK_AGO = NOW - 7 * 24 * 3_600_000

describe('formatDistanceToNow', () => {
  bench('recent timestamp (minutes ago)', () => {
    formatDistanceToNow(NOW - 300_000)
  })

  bench('old timestamp (days + hours ago)', () => {
    formatDistanceToNow(ONE_WEEK_AGO)
  })

  bench('string date input', () => {
    formatDistanceToNow('2026-03-01T12:00:00Z')
  })

  bench('Date object input', () => {
    formatDistanceToNow(new Date(ONE_HOUR_AGO))
  })
})

describe('format', () => {
  const date = new Date(2026, 2, 30, 14, 30, 45)

  bench('simple format (yyyy-MM-dd)', () => {
    format(date, 'yyyy-MM-dd')
  })

  bench('full format (MMMM dd, yyyy HH:mm:ss)', () => {
    format(date, 'MMMM dd, yyyy HH:mm:ss')
  })

  bench('12-hour format (MMM d, yyyy h:mm a)', () => {
    format(date, 'MMM d, yyyy h:mm a')
  })

  bench('timestamp input', () => {
    format(NOW, 'yyyy-MM-dd HH:mm')
  })
})

describe('formatDateKey', () => {
  bench('Date to YYYY-MM-DD key', () => {
    formatDateKey(new Date())
  })
})

describe('formatDuration', () => {
  bench('milliseconds', () => {
    formatDuration(450)
  })

  bench('seconds', () => {
    formatDuration(12500)
  })

  bench('minutes', () => {
    formatDuration(185000)
  })
})

describe('formatUptime', () => {
  bench('seconds', () => {
    formatUptime(45_000)
  })

  bench('hours and minutes', () => {
    formatUptime(7_380_000)
  })

  bench('days and hours', () => {
    formatUptime(90_000_000)
  })
})

describe('formatDateFull', () => {
  bench('timestamp input', () => {
    formatDateFull(NOW)
  })

  bench('string input', () => {
    formatDateFull('2026-03-30T14:30:00Z')
  })

  bench('null input', () => {
    formatDateFull(null)
  })
})

describe('formatDateCompact', () => {
  bench('timestamp input', () => {
    formatDateCompact(NOW)
  })
})

describe('formatHour12', () => {
  bench('all 24 hours', () => {
    for (let h = 0; h < 24; h++) {
      formatHour12(h)
    }
  })
})
