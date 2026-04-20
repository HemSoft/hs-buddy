import type { TempoWorklog } from '../../types/tempo'
import { Clock, Target, TrendingUp, Landmark, CheckCircle2, XCircle } from 'lucide-react'

interface TempoSummaryCardsProps {
  todayHours: number
  monthHours: number
  monthTarget: number
  isCurrentMonth: boolean
  viewMonth: Date
  worklogs: TempoWorklog[]
  capexMap: Record<string, boolean>
}

export function TempoSummaryCards({
  todayHours,
  monthHours,
  monthTarget,
  isCurrentMonth,
  viewMonth,
  worklogs,
  capexMap,
}: TempoSummaryCardsProps) {
  const remaining = Math.max(0, monthTarget - monthHours)
  /* v8 ignore start */
  const pct = monthTarget > 0 ? Math.min(100, Math.round((monthHours / monthTarget) * 100)) : 0
  /* v8 ignore stop */
  const isMonthComplete = monthTarget > 0 && monthHours >= monthTarget
  const now = new Date()
  const isPastMonth = !isCurrentMonth && viewMonth < new Date(now.getFullYear(), now.getMonth(), 1)

  const capexHours = worklogs.filter(w => capexMap[w.issueKey]).reduce((sum, w) => sum + w.hours, 0)
  const nonCapexHours = Math.round((monthHours - capexHours) * 100) / 100
  /* v8 ignore start */
  const capexPct = monthHours > 0 ? Math.round((capexHours / monthHours) * 100) : 0
  /* v8 ignore stop */

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

      <div
        className={`tempo-card ${isMonthComplete ? 'tempo-card-complete' : 'tempo-card-remaining'}`}
      >
        <div className="tempo-card-icon">
          {isMonthComplete ? <CheckCircle2 size={18} /> : <Target size={18} />}
        </div>
        <div className="tempo-card-body">
          {isMonthComplete ? (
            <>
              <span className="tempo-card-value">Complete</span>
              <span className="tempo-card-label">All hours logged</span>
            </>
          ) : (
            <>
              <span className="tempo-card-value">{remaining}h</span>
              <span className="tempo-card-label">
                {isPastMonth && monthTarget > 0 ? 'Missing' : 'Remaining'}
              </span>
            </>
          )}
        </div>
        {isPastMonth && monthTarget > 0 && !isMonthComplete && (
          <div className="tempo-card-badge-missing">
            <XCircle size={14} />
          </div>
        )}
      </div>

      {monthHours > 0 && (
        <div className="tempo-card tempo-card-capex">
          <div className="tempo-card-icon">
            <Landmark size={18} />
          </div>
          <div className="tempo-card-body">
            <span className="tempo-card-value">
              {capexHours}h<span className="tempo-card-unit"> capex ({capexPct}%)</span>
            </span>
            <span className="tempo-card-label">{nonCapexHours}h non-capex</span>
          </div>
          <div className="tempo-card-meter">
            <div className="tempo-card-meter-fill capex-fill" style={{ width: `${capexPct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
