export function formatUpdatedAge(fetchedAt: number): string {
  const elapsedMs = Date.now() - fetchedAt
  if (elapsedMs < 60_000) return 'updated now'
  const elapsedMinutes = Math.floor(elapsedMs / 60_000)
  if (elapsedMinutes < 60) return `updated ${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  return `updated ${elapsedHours}h ago`
}
