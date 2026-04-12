import { DAY } from './dateUtils'

export function formatCopilotPlan(plan: string | null): string {
  if (!plan) return 'Unknown'

  const labels: Record<string, string> = {
    business: 'Business',
    enterprise: 'Enterprise',
    individual: 'Pro',
    individual_pro: 'Pro+',
    free: 'Free',
  }

  return labels[plan] ?? plan
}

export function formatResetDate(dateStr: string, includeYear = false): string {
  const date = new Date(dateStr)
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

  if (includeYear) {
    options.year = 'numeric'
  }

  return date.toLocaleDateString(undefined, options)
}

export function daysUntilReset(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / DAY))
}
