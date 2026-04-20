/**
 * Date utility functions for Buddy
 * Lightweight date formatting without external dependencies
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY

export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * Format a timestamp as relative time (e.g., "32 minutes ago", "3 days and 4 hours ago")
 */
export function formatDistanceToNow(timestamp: number | string | Date): string {
  const time =
    timestamp instanceof Date
      ? timestamp.getTime()
      : typeof timestamp === 'string'
        ? new Date(timestamp).getTime()
        : timestamp

  if (!Number.isFinite(time)) {
    return ''
  }

  const now = Date.now()
  const diff = now - time

  if (diff < MINUTE) {
    // Covers future timestamps (diff <= 0) and very recent ones (diff < 60s)
    return 'just now'
  }

  const units = [
    { value: MONTH, label: 'month' },
    { value: WEEK, label: 'week' },
    { value: DAY, label: 'day' },
    { value: HOUR, label: 'hour' },
    { value: MINUTE, label: 'minute' },
  ]

  let remaining = diff
  const parts: string[] = []

  for (const unit of units) {
    const count = Math.floor(remaining / unit.value)
    if (count <= 0) {
      continue
    }

    parts.push(`${count} ${count === 1 ? unit.label : `${unit.label}s`}`)
    remaining -= count * unit.value

    if (parts.length === 2) {
      break
    }
  }

  /* v8 ignore start -- defensive guard; unreachable because diff >= MINUTE guarantees at least one unit matches */
  if (parts.length === 0) {
    return 'just now'
  }
  /* v8 ignore stop */

  if (parts.length === 1) {
    return `${parts[0]} ago`
  }

  return `${parts[0]} and ${parts[1]} ago`
}

/**
 * Format a timestamp or Date with a format string
 * Supports: yyyy, MM, MMM, MMMM, dd, d, HH, h, mm, ss, a
 */
export function format(date: number | Date, formatStr: string): string {
  const d = typeof date === 'number' ? new Date(date) : date

  const year = d.getFullYear()
  const month = d.getMonth()
  const day = d.getDate()
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const seconds = d.getSeconds()

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  const hour12 = hours % 12 || 12
  const ampm = hours < 12 ? 'AM' : 'PM'

  const replacements: Record<string, string> = {
    yyyy: String(year),
    yy: String(year).slice(-2),
    MMMM: monthNames[month],
    MMM: MONTH_SHORT[month],
    MM: String(month + 1).padStart(2, '0'),
    M: String(month + 1),
    dd: String(day).padStart(2, '0'),
    d: String(day),
    HH: String(hours).padStart(2, '0'),
    H: String(hours),
    hh: String(hour12).padStart(2, '0'),
    h: String(hour12),
    mm: String(minutes).padStart(2, '0'),
    m: String(minutes),
    ss: String(seconds).padStart(2, '0'),
    s: String(seconds),
    a: ampm.toLowerCase(),
    A: ampm,
  }

  // Sort by length descending to replace longer patterns first
  const patterns = Object.keys(replacements).sort((a, b) => b.length - a.length)

  let result = formatStr
  for (const pattern of patterns) {
    result = result.replace(new RegExp(pattern, 'g'), replacements[pattern])
  }

  return result
}

function formatDateLocale(
  date: string | number | null | undefined,
  options: Intl.DateTimeFormatOptions,
  nullLabel: string
): string {
  if (date == null) return nullLabel
  return new Date(date).toLocaleString(undefined, options)
}

export function formatDateFull(date: string | number | null | undefined): string {
  return formatDateLocale(
    date,
    {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    },
    'N/A'
  )
}

export function formatDateCompact(date: string | number | null | undefined): string {
  return formatDateLocale(
    date,
    {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    },
    '—'
  )
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

export function formatSecondsCountdown(secs: number): string {
  if (secs <= 0) return 'now'
  const minutes = Math.floor(secs / 60)
  const seconds = Math.floor(secs % 60)
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

export function formatUptime(ms: number): string {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1_000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

export function formatTime(
  ts: number | Date,
  opts?: { seconds?: boolean; hour12?: boolean; numeric?: boolean }
) {
  const d = ts instanceof Date ? ts : new Date(ts)
  return d.toLocaleTimeString(undefined, {
    hour: opts?.numeric ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(opts?.seconds ? { second: '2-digit' } : {}),
    ...(opts?.hour12 !== undefined ? { hour12: opts.hour12 } : {}),
  })
}

export function formatHour12(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

/**
 * Format a Date as YYYY-MM-DD using local timezone (avoids UTC conversion via toISOString).
 * Use this instead of `date.toISOString().slice(0, 10)` to prevent date shifts in
 * timezones where midnight local → UTC crosses a date boundary.
 */
export function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
