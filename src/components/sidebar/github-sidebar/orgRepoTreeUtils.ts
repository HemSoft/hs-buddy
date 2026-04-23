import { MS_PER_MINUTE } from '../../../constants'

export function formatUpdatedAge(fetchedAt: number): string {
  const elapsedMs = Date.now() - fetchedAt
  if (elapsedMs < MS_PER_MINUTE) return 'updated now'
  const elapsedMinutes = Math.floor(elapsedMs / MS_PER_MINUTE)
  if (elapsedMinutes < 60) return `updated ${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  return `updated ${elapsedHours}h ago`
}
