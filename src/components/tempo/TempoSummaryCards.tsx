import type { TempoWorklog } from '../../types/tempo'
import { Clock, Target, TrendingUp, Landmark } from 'lucide-react'

interface TempoSummaryCardsProps {
  todayHours: number
  monthHours: number
  monthTarget: number
  isCurrentMonth: boolean
  worklogs: TempoWorklog[]
  capexMap: Record<string, boolean>
}

export function TempoSummaryCards({
  todayHours,
  monthHours,
  monthTarget,
  isCurrentMonth,
  worklogs,
  capexMap,
}: TempoSummaryCardsProps) {
  const remaining = Math.max(0, monthTarget - monthHours)
  const pct = monthTarget > 0 ? Math.min(100, Math.round((monthHours / monthTarget) * 100)) : 0

  const capexHours = worklogs
    .filter(w => capexMap[w.issueKey])
    .reduce((sum, w) => sum + w.hours, 0)
  const nonCapexHours = Math.round((monthHours - capexHours) * 100) / 100
  const capexPct = monthHours > 0 ? Math.round((capexHours / monthHours) * 100) : 0

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

      {monthHours > 0 && (
        <div className="tempo-card tempo-card-capex">
          <div className="tempo-card-icon">
            <Landmark size={18} />
          </div>
          <div className="tempo-card-body">
            <span className="tempo-card-value">
              {capexHours}h
              <span className="tempo-card-unit"> capex ({capexPct}%)</span>
            </span>
            <span className="tempo-card-label">{nonCapexHours}h non-capex</span>
          </div>
          <div className="tempo-card-meter">
            <div
              className="tempo-card-meter-fill capex-fill"
              style={{ width: `${capexPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
