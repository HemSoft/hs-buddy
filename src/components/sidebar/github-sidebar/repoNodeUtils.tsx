import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  MinusCircle,
  XCircle,
} from 'lucide-react'
import type { SFLOverallStatus } from '../../../types/sflStatus'

export const SFL_STATUS_LABELS: Record<SFLOverallStatus, string> = {
  healthy: 'Healthy',
  'active-work': 'Active work',
  blocked: 'Blocked',
  'ready-for-review': 'Ready for review',
  'recent-failure': 'Recent failure',
  unknown: 'Unknown',
}

const OVERALL_STATUS_ICONS: Record<SFLOverallStatus, { icon: LucideIcon; className: string }> = {
  healthy: { icon: CheckCircle2, className: 'sfl-status-success' },
  'active-work': { icon: Clock, className: 'sfl-status-info' },
  blocked: { icon: AlertTriangle, className: 'sfl-status-warning' },
  'ready-for-review': { icon: CircleDot, className: 'sfl-status-info' },
  'recent-failure': { icon: XCircle, className: 'sfl-status-error' },
  unknown: { icon: Circle, className: 'sfl-status-muted' },
}

export function sflOverallStatusIcon(status: SFLOverallStatus) {
  const entry = OVERALL_STATUS_ICONS[status] ?? OVERALL_STATUS_ICONS.unknown
  const Icon = entry.icon
  return <Icon size={12} className={`sfl-status-icon ${entry.className}`} />
}

const CONCLUSION_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: 'sfl-status-success' },
  failure: { icon: XCircle, className: 'sfl-status-error' },
  timed_out: { icon: XCircle, className: 'sfl-status-error' },
  skipped: { icon: MinusCircle, className: 'sfl-status-muted' },
}

const DEFAULT_CONCLUSION_ICON = { icon: Clock, className: 'sfl-status-info' }

export function sflWorkflowStateIcon(state: string, conclusion: string | null) {
  if (state !== 'active') {
    return <MinusCircle size={11} className="sfl-status-icon sfl-status-muted" />
  }
  if (!conclusion) return <Circle size={11} className="sfl-status-icon sfl-status-muted" />

  const entry = CONCLUSION_ICONS[conclusion] ?? DEFAULT_CONCLUSION_ICON
  const Icon = entry.icon
  return <Icon size={11} className={`sfl-status-icon ${entry.className}`} />
}

export function handleItemKeyDown(
  event: React.KeyboardEvent,
  action: () => void,
  stopPropagation = false
) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  if (stopPropagation) {
    event.stopPropagation()
  }
  action()
}

export function sidebarItemClass(baseClass: string, isSelected: boolean): string {
  if (isSelected) return `${baseClass} selected`
  return baseClass
}

const REFRESH_STATE_CLASSES: Record<string, string> = {
  active: 'refresh-active',
  pending: 'refresh-pending',
}

export function refreshStateClass(state: string | undefined): string {
  return (state && REFRESH_STATE_CLASSES[state]) ?? ''
}
