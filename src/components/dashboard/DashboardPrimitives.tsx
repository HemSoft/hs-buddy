import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { INTERVAL_OPTIONS } from '../../hooks/useAutoRefresh'

interface StatCardProps {
  icon: ReactNode
  value: string
  label: string
  subtitle?: string
  cardClassName?: string
  iconClassName?: string
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatStatNumber(n: number): string {
  return n.toLocaleString()
}

export function SectionHeading({
  kicker,
  title,
  caption,
}: {
  kicker: string
  title: string
  caption: string
}) {
  return (
    <div className="welcome-section-heading">
      <div className="welcome-section-heading-copy">
        <span className="welcome-section-kicker">{kicker}</span>
        <h2 className="welcome-section-title">{title}</h2>
      </div>
      <span className="welcome-section-caption">{caption}</span>
    </div>
  )
}

export function StatCard({
  icon,
  value,
  label,
  subtitle,
  cardClassName,
  iconClassName,
}: StatCardProps) {
  const cardClasses = ['welcome-stat-card', cardClassName].filter(Boolean).join(' ')
  const iconClasses = ['welcome-stat-icon', iconClassName].filter(Boolean).join(' ')

  return (
    <div className={cardClasses}>
      <div className={iconClasses}>{icon}</div>
      <div className="welcome-stat-info">
        <span className="welcome-stat-value">{value}</span>
        <span className="welcome-stat-label">{label}</span>
        {subtitle && <span className="welcome-stat-subtitle">{subtitle}</span>}
      </div>
    </div>
  )
}

/* ── Shared card chrome ──────────────────────────────────────────────── */

export function CardHeader({
  expanded,
  onToggle,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="card-header-row">
      {children}
      <button
        type="button"
        className="card-collapse-btn"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse section' : 'Expand section'}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
  )
}

interface CardActionBarProps {
  onRefresh: () => void
  loading: boolean
  refreshTitle?: string
  selectedInterval: number
  onIntervalChange: (minutes: number) => void
  lastRefreshedLabel: string | null
  nextRefreshLabel: string | null
  children?: ReactNode
}

export function CardActionBar({
  onRefresh,
  loading,
  refreshTitle = 'Refresh',
  selectedInterval,
  onIntervalChange,
  lastRefreshedLabel,
  nextRefreshLabel,
  children,
}: CardActionBarProps) {
  return (
    <>
      <div className="card-actions">
        <button
          type="button"
          className="welcome-usage-btn"
          onClick={onRefresh}
          disabled={loading}
          title={refreshTitle}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
        {children}
        <select
          className="card-auto-refresh-select"
          value={selectedInterval}
          onChange={e => onIntervalChange(Number(e.target.value))}
          aria-label="Auto-refresh interval"
        >
          {INTERVAL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {lastRefreshedLabel && (
        <div className="card-refresh-status">
          <span>{`Updated ${lastRefreshedLabel}`}</span>
          {nextRefreshLabel && <span>{` · Next in ${nextRefreshLabel}`}</span>}
        </div>
      )}
    </>
  )
}
