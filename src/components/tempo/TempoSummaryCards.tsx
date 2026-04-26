import type { TempoWorklog } from '../../types/tempo'
import { Clock, Target, TrendingUp, Landmark, CheckCircle2, XCircle } from 'lucide-react'
import { sumBy } from '../../utils/arrayUtils'

interface TempoSummaryCardsProps {
  todayHours: number
  monthHours: number
  monthTarget: number
  isCurrentMonth: boolean
  viewMonth: Date
  worklogs: TempoWorklog[]
  capexMap: Record<string, boolean>
}

interface SummaryMetrics {
  remaining: number
  pct: number
  isMonthComplete: boolean
  isPastMonth: boolean
  capexHours: number
  nonCapexHours: number
  capexPct: number
}

function computeSummaryMetrics(
  monthHours: number,
  monthTarget: number,
  isCurrentMonth: boolean,
  viewMonth: Date,
  worklogs: TempoWorklog[],
  capexMap: Record<string, boolean>
): SummaryMetrics {
  const remaining = Math.max(0, monthTarget - monthHours)
  /* v8 ignore start */
  const pct = monthTarget > 0 ? Math.min(100, Math.round((monthHours / monthTarget) * 100)) : 0
  /* v8 ignore stop */
  const isMonthComplete = monthTarget > 0 && monthHours >= monthTarget
  const now = new Date()
  const isPastMonth = !isCurrentMonth && viewMonth < new Date(now.getFullYear(), now.getMonth(), 1)
  const capexHours = sumBy(
    worklogs.filter(w => capexMap[w.issueKey]),
    w => w.hours
  )
  const nonCapexHours = Math.round((monthHours - capexHours) * 100) / 100
  /* v8 ignore start */
  const capexPct = monthHours > 0 ? Math.round((capexHours / monthHours) * 100) : 0
  /* v8 ignore stop */
  return { remaining, pct, isMonthComplete, isPastMonth, capexHours, nonCapexHours, capexPct }
}

function TodayCard({ todayHours }: { todayHours: number }) {
  return (
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
  )
}

function RemainingCardBody({
  isMonthComplete,
  remaining,
  showMissing,
}: {
  isMonthComplete: boolean
  remaining: number
  showMissing: boolean
}) {
  if (isMonthComplete) {
    return (
      <>
        <span className="tempo-card-value">Complete</span>
        <span className="tempo-card-label">All hours logged</span>
      </>
    )
  }
  return (
    <>
      <span className="tempo-card-value">{remaining}h</span>
      <span className="tempo-card-label">{showMissing ? 'Missing' : 'Remaining'}</span>
    </>
  )
}

function RemainingCard({
  isMonthComplete,
  remaining,
  isPastMonth,
  monthTarget,
}: {
  isMonthComplete: boolean
  remaining: number
  isPastMonth: boolean
  monthTarget: number
}) {
  const showMissing = isPastMonth && monthTarget > 0
  const cardClass = `tempo-card ${isMonthComplete ? 'tempo-card-complete' : 'tempo-card-remaining'}`
  const hasMissingBadge = showMissing && !isMonthComplete
  return (
    <div className={cardClass}>
      <div className="tempo-card-icon">
        {isMonthComplete ? <CheckCircle2 size={18} /> : <Target size={18} />}
      </div>
      <div className="tempo-card-body">
        <RemainingCardBody
          isMonthComplete={isMonthComplete}
          remaining={remaining}
          showMissing={showMissing}
        />
      </div>
      {hasMissingBadge && (
        <div className="tempo-card-badge-missing">
          <XCircle size={14} />
        </div>
      )}
    </div>
  )
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
  const { remaining, pct, isMonthComplete, isPastMonth, capexHours, nonCapexHours, capexPct } =
    computeSummaryMetrics(monthHours, monthTarget, isCurrentMonth, viewMonth, worklogs, capexMap)

  return (
    <div className="tempo-summary-cards">
      {isCurrentMonth && <TodayCard todayHours={todayHours} />}

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

      <RemainingCard
        isMonthComplete={isMonthComplete}
        remaining={remaining}
        isPastMonth={isPastMonth}
        monthTarget={monthTarget}
      />

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
