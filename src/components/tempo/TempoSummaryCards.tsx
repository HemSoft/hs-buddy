import type { TempoIssueSummary } from '../../types/tempo'
import { Clock, Target, TrendingUp, Zap } from 'lucide-react'

interface TempoSummaryCardsProps {
  todayHours: number
  monthHours: number
  monthTarget: number
  issueSummaries: TempoIssueSummary[]
  isCurrentMonth: boolean
}

export function TempoSummaryCards({
  todayHours,
  monthHours,
  monthTarget,
  issueSummaries,
  isCurrentMonth,
}: TempoSummaryCardsProps) {
  const remaining = Math.max(0, monthTarget - monthHours)
  const pct = monthTarget > 0 ? Math.min(100, Math.round((monthHours / monthTarget) * 100)) : 0
  const topIssue = issueSummaries[0]

  return (
    <div className="tempo-summary-cards">
      {isCurrentMonth && (
        <div className="tempo-card tempo-card-today">
          <div className="tempo-card-icon">
            <Clock size={18} />
          </div>
          <div className="tempo-card-body">
            <span className="tempo-card-value">{todayHours}h</span>
            <span className="tempo-card-label">Today</span>
          </div>
          <div className="tempo-card-meter">
            <div
              className="tempo-card-meter-fill"
              style={{ width: `${Math.min(100, (todayHours / 8) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="tempo-card tempo-card-month">
        <div className="tempo-card-icon">
          <TrendingUp size={18} />
        </div>
        <div className="tempo-card-body">
          <span className="tempo-card-value">
            {monthHours}
            <span className="tempo-card-unit">/{monthTarget}h</span>
          </span>
          <span className="tempo-card-label">Month ({pct}%)</span>
        </div>
        <div className="tempo-card-meter">
          <div className="tempo-card-meter-fill month-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="tempo-card tempo-card-remaining">
        <div className="tempo-card-icon">
          <Target size={18} />
        </div>
        <div className="tempo-card-body">
          <span className="tempo-card-value">{remaining}h</span>
          <span className="tempo-card-label">Remaining</span>
        </div>
      </div>

      {topIssue && (
        <div className="tempo-card tempo-card-top">
          <div className="tempo-card-icon">
            <Zap size={18} />
          </div>
          <div className="tempo-card-body">
            <span className="tempo-card-value">{topIssue.issueKey}</span>
            <span className="tempo-card-label">
              Top Issue · {topIssue.totalHours}h
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
