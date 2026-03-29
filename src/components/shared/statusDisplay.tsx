import { Clock, Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react'
import type { ReactNode } from 'react'

const STATUS_ICONS: Record<string, (size: number, classPrefix: string) => ReactNode> = {
  pending: (size, cls) => <Clock size={size} className={`${cls}-pending`} />,
  running: (size, cls) => <Loader2 size={size} className={`spin ${cls}-running`} />,
  completed: (size, cls) => <CheckCircle2 size={size} className={`${cls}-completed`} />,
  failed: (size, cls) => <XCircle size={size} className={`${cls}-failed`} />,
  cancelled: (size, cls) => <Ban size={size} className={`${cls}-cancelled`} />,
}

const STATUS_CLASSES: Record<string, string> = {
  pending: 'status-pending',
  running: 'status-running',
  completed: 'status-completed',
  failed: 'status-failed',
  cancelled: 'status-cancelled',
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
  return STATUS_CLASSES[status] ?? ''
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
