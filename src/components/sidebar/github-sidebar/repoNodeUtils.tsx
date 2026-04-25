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

export function sflOverallStatusIcon(status: SFLOverallStatus) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 size={12} className="sfl-status-icon sfl-status-success" />
    case 'active-work':
      return <Clock size={12} className="sfl-status-icon sfl-status-info" />
    case 'blocked':
      return <AlertTriangle size={12} className="sfl-status-icon sfl-status-warning" />
    case 'ready-for-review':
      return <CircleDot size={12} className="sfl-status-icon sfl-status-info" />
    case 'recent-failure':
      return <XCircle size={12} className="sfl-status-icon sfl-status-error" />
    default:
      return <Circle size={12} className="sfl-status-icon sfl-status-muted" />
  }
}

export function sflWorkflowStateIcon(state: string, conclusion: string | null) {
  if (state !== 'active') {
    return <MinusCircle size={11} className="sfl-status-icon sfl-status-muted" />
  }
  if (!conclusion) return <Circle size={11} className="sfl-status-icon sfl-status-muted" />

  switch (conclusion) {
    case 'success':
      return <CheckCircle2 size={11} className="sfl-status-icon sfl-status-success" />
    case 'failure':
    case 'timed_out':
      return <XCircle size={11} className="sfl-status-icon sfl-status-error" />
    case 'skipped':
      return <MinusCircle size={11} className="sfl-status-icon sfl-status-muted" />
    default:
      return <Clock size={11} className="sfl-status-icon sfl-status-info" />
  }
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
