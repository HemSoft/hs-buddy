import type { ReactNode } from 'react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import './PanelStates.css'

interface PanelLoadingStateProps {
  message?: string
  subtitle?: string
  size?: number
  className?: string
}

export function PanelLoadingState({
  message = 'Loading...',
  subtitle,
  size = 32,
  className,
}: PanelLoadingStateProps) {
  return (
    <div className={`panel-loading${className ? ` ${className}` : ''}`}>
      <Loader2 size={size} className="spin" />
      <p>{message}</p>
      {subtitle && <p className="panel-loading-sub">{subtitle}</p>}
    </div>
  )
}

interface PanelErrorStateProps {
  title?: string
  error: string
  onRetry?: () => void
  className?: string
}

export function PanelErrorState({
  title = 'Failed to load',
  error,
  onRetry,
  className,
}: PanelErrorStateProps) {
  return (
    <div className={`panel-error${className ? ` ${className}` : ''}`}>
      <AlertCircle size={32} />
      <p className="panel-error-title">{title}</p>
      <p className="panel-error-detail">{error}</p>
      {onRetry && (
        <button type="button" className="panel-error-retry" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  )
}

interface InlineRefreshIndicatorProps {
  message?: string
}

export function InlineRefreshIndicator({ message = 'Refreshing...' }: InlineRefreshIndicatorProps) {
  return (
    <div className="panel-inline-refresh" role="status" aria-live="polite">
      <Loader2 size={14} className="spin" />
      <span>{message}</span>
    </div>
  )
}

interface PanelEmptyStateProps {
  icon: ReactNode
  message: string
  subtitle?: string
}

export function PanelEmptyState({ icon, message, subtitle }: PanelEmptyStateProps) {
  return (
    <div className="panel-empty">
      {icon}
      <p>{message}</p>
      {subtitle && <p className="empty-subtitle">{subtitle}</p>}
    </div>
  )
}
