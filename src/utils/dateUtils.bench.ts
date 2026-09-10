import { test, describe } from 'vitest'
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
  test('recent timestamp (minutes ago)', async ({ bench }) => {
    await bench('recent timestamp (minutes ago)', () => {
      formatDistanceToNow(NOW - 300_000)
    }).run()
  })

  test('old timestamp (days + hours ago)', async ({ bench }) => {
    await bench('old timestamp (days + hours ago)', () => {
      formatDistanceToNow(ONE_WEEK_AGO)
    }).run()
  })

  test('string date input', async ({ bench }) => {
    await bench('string date input', () => {
      formatDistanceToNow('2026-03-01T12:00:00Z')
    }).run()
  })

  test('Date object input', async ({ bench }) => {
    await bench('Date object input', () => {
      formatDistanceToNow(new Date(ONE_HOUR_AGO))
    }).run()
  })
})

describe('format', () => {
  const date = new Date(2026, 2, 30, 14, 30, 45)

  test('simple format (yyyy-MM-dd)', async ({ bench }) => {
    await bench('simple format (yyyy-MM-dd)', () => {
      format(date, 'yyyy-MM-dd')
    }).run()
  })

  test('full format (MMMM dd, yyyy HH:mm:ss)', async ({ bench }) => {
    await bench('full format (MMMM dd, yyyy HH:mm:ss)', () => {
      format(date, 'MMMM dd, yyyy HH:mm:ss')
    }).run()
  })

  test('12-hour format (MMM d, yyyy h:mm a)', async ({ bench }) => {
    await bench('12-hour format (MMM d, yyyy h:mm a)', () => {
      format(date, 'MMM d, yyyy h:mm a')
    }).run()
  })

  test('timestamp input', async ({ bench }) => {
    await bench('timestamp input', () => {
      format(NOW, 'yyyy-MM-dd HH:mm')
    }).run()
  })
})

describe('formatDateKey', () => {
  test('Date to YYYY-MM-DD key', async ({ bench }) => {
    await bench('Date to YYYY-MM-DD key', () => {
      formatDateKey(new Date())
    }).run()
  })
})

describe('formatDuration', () => {
  test('milliseconds', async ({ bench }) => {
    await bench('milliseconds', () => {
      formatDuration(450)
    }).run()
  })

  test('seconds', async ({ bench }) => {
    await bench('seconds', () => {
      formatDuration(12500)
    }).run()
  })

  test('minutes', async ({ bench }) => {
    await bench('minutes', () => {
      formatDuration(185000)
    }).run()
  })
})

describe('formatUptime', () => {
  test('seconds', async ({ bench }) => {
    await bench('seconds', () => {
      formatUptime(45_000)
    }).run()
  })

  test('hours and minutes', async ({ bench }) => {
    await bench('hours and minutes', () => {
      formatUptime(7_380_000)
    }).run()
  })

  test('days and hours', async ({ bench }) => {
    await bench('days and hours', () => {
      formatUptime(90_000_000)
    }).run()
  })
})

describe('formatDateFull', () => {
  test('timestamp input', async ({ bench }) => {
    await bench('timestamp input', () => {
      formatDateFull(NOW)
    }).run()
  })

  test('string input', async ({ bench }) => {
    await bench('string input', () => {
      formatDateFull('2026-03-30T14:30:00Z')
    }).run()
  })

  test('null input', async ({ bench }) => {
    await bench('null input', () => {
      formatDateFull(null)
    }).run()
  })
})

describe('formatDateCompact', () => {
  test('timestamp input', async ({ bench }) => {
    await bench('timestamp input', () => {
      formatDateCompact(NOW)
    }).run()
  })
})

describe('formatHour12', () => {
  test('all 24 hours', async ({ bench }) => {
    await bench('all 24 hours', () => {
      for (let h = 0; h < 24; h++) {
        formatHour12(h)
      }
    }).run()
  })
})
