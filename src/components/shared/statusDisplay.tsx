import { Clock, Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react'
import type { ReactNode } from 'react'

const STATUS_ICONS: Record<string, (size: number, classPrefix: string) => ReactNode> = {
  pending: (size, cls) => <Clock size={size} className={`${cls}-pending`} />,
  running: (size, cls) => <Loader2 size={size} className={`spin ${cls}-running`} />,
  completed: (size, cls) => <CheckCircle2 size={size} className={`${cls}-completed`} />,
  failed: (size, cls) => <XCircle size={size} className={`${cls}-failed`} />,
  cancelled: (size, cls) => <Ban size={size} className={`${cls}-cancelled`} />,
}

export function getStatusIcon(status: string, size = 14, classPrefix = 'status'): ReactNode {
  return STATUS_ICONS[status]?.(size, classPrefix) ?? null
}

export function getStatusLabel(status: string, includeInProgressEllipsis = false): string {
  if (includeInProgressEllipsis && (status === 'pending' || status === 'running')) {
    return `${status.charAt(0).toUpperCase() + status.slice(1)}...`
  }

  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function getStatusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'status-completed'
    case 'failed':
      return 'status-failed'
    case 'running':
      return 'status-running'
    case 'pending':
      return 'status-pending'
    case 'cancelled':
      return 'status-cancelled'
    default:
      return ''
  }
}

const STATUS_EMOJIS: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  cancelled: '🚫',
}

export function getStatusEmoji(status: string): string {
  return STATUS_EMOJIS[status] ?? '•'
}
