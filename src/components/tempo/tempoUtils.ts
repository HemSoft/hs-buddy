import type { TempoWorklog } from '../../types/tempo'

/** Compute the next start time by stacking after existing entries from 08:00 */
export function nextStartTime(worklogs: TempoWorklog[]): string {
  const totalMinutes = worklogs.reduce((sum, w) => sum + w.hours * 60, 0)
  const startMinutes = 8 * 60 + totalMinutes
  const h = Math.floor(startMinutes / 60) % 24
  const m = Math.round(startMinutes % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function validateWorklogFields(
  issueKey: string,
  hours: string,
  date: string
): string | null {
  if (!issueKey.trim()) return 'Issue key is required'
  const h = parseFloat(hours)
  if (isNaN(h) || h <= 0 || h > 24) return 'Hours must be between 0 and 24'
  if (!date) return 'Date is required'
  return null
}
