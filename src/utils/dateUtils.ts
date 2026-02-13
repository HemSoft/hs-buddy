/**
 * Date utility functions for Buddy
 * Lightweight date formatting without external dependencies
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY

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

  if (parts.length === 0) {
    return 'just now'
  }

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
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const hour12 = hours % 12 || 12
  const ampm = hours < 12 ? 'AM' : 'PM'

  const replacements: Record<string, string> = {
    'yyyy': String(year),
    'yy': String(year).slice(-2),
    'MMMM': monthNames[month],
    'MMM': monthShort[month],
    'MM': String(month + 1).padStart(2, '0'),
    'M': String(month + 1),
    'dd': String(day).padStart(2, '0'),
    'd': String(day),
    'HH': String(hours).padStart(2, '0'),
    'H': String(hours),
    'hh': String(hour12).padStart(2, '0'),
    'h': String(hour12),
    'mm': String(minutes).padStart(2, '0'),
    'm': String(minutes),
    'ss': String(seconds).padStart(2, '0'),
    's': String(seconds),
    'a': ampm.toLowerCase(),
    'A': ampm,
  }

  // Sort by length descending to replace longer patterns first
  const patterns = Object.keys(replacements).sort((a, b) => b.length - a.length)
  
  let result = formatStr
  for (const pattern of patterns) {
    result = result.replace(new RegExp(pattern, 'g'), replacements[pattern])
  }

  return result
}

/**
 * Get relative time description for upcoming dates
 */
export function formatDistanceToFuture(timestamp: number): string {
  const now = Date.now()
  const diff = timestamp - now

  if (diff < 0) {
    return 'overdue'
  }

  if (diff < MINUTE) {
    return 'in less than a minute'
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE)
    return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }

  if (diff < WEEK) {
    const days = Math.floor(diff / DAY)
    return `in ${days} ${days === 1 ? 'day' : 'days'}`
  }

  const weeks = Math.floor(diff / WEEK)
  return `in ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
}

/**
 * Check if a timestamp is today
 */
export function isToday(timestamp: number): boolean {
  const date = new Date(timestamp)
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

/**
 * Check if a timestamp is within the last N days
 */
export function isWithinDays(timestamp: number, days: number): boolean {
  const cutoff = Date.now() - (days * DAY)
  return timestamp >= cutoff
}
