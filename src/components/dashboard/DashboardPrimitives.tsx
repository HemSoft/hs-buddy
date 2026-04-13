import type { ReactNode } from 'react'

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
