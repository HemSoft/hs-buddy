import { useMemo } from 'react'
import type { TempoIssueSummary, TempoWorklog } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'

interface TempoTimesheetGridProps {
  issueSummaries: TempoIssueSummary[]
  worklogs: TempoWorklog[]
  totalHours: number
  monthDate: Date
  loading: boolean
  onCellClick: (date: string) => void
  onWorklogEdit: (worklog: TempoWorklog) => void
  onWorklogDelete: (worklog: TempoWorklog) => void
}

interface DayColumn {
  date: string // YYYY-MM-DD
  dayNum: number
  dayLabel: string // MON, TUE, ...
  isWeekend: boolean
  isToday: boolean
}

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function buildDayColumns(monthDate: Date): DayColumn[] {
  const y = monthDate.getFullYear()
  const m = monthDate.getMonth()
  const today = formatDateKey(new Date())
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cols: DayColumn[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m, d)
    const dow = dt.getDay()
    const dateStr = formatDateKey(dt)
    cols.push({
      date: dateStr,
      dayNum: d,
      dayLabel: DAY_LABELS[dow],
      isWeekend: dow === 0 || dow === 6,
      isToday: dateStr === today,
    })
  }
  return cols
}

function findWorklogsForCell(
  worklogs: TempoWorklog[],
  issueKey: string,
  date: string
): TempoWorklog[] {
  return worklogs.filter(w => w.issueKey === issueKey && w.date === date)
}

export function TempoTimesheetGrid({
  issueSummaries,
  worklogs,
  totalHours,
  monthDate,
  loading,
  onCellClick,
  onWorklogEdit,
  onWorklogDelete,
}: TempoTimesheetGridProps) {
  const columns = useMemo(() => buildDayColumns(monthDate), [monthDate])

  // Compute daily totals
  const dailyTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const w of worklogs) {
      map[w.date] = (map[w.date] || 0) + w.hours
    }
    return map
  }, [worklogs])

  if (loading && issueSummaries.length === 0) {
    return (
      <div className="tempo-grid-loading">
        <div className="tempo-grid-skeleton" />
        <div className="tempo-grid-skeleton" />
        <div className="tempo-grid-skeleton" />
      </div>
    )
  }

  if (!loading && issueSummaries.length === 0) {
    return (
      <div className="tempo-empty">
        <p>No worklogs this month. Click a cell or use Quick Log to get started.</p>
      </div>
    )
  }

  return (
    <div className="tempo-grid-wrapper">
      <div className="tempo-grid-scroll">
        <table className="tempo-grid">
          <thead>
            <tr>
              <th className="tempo-grid-issue-header">Issue</th>
              <th className="tempo-grid-key-header">Key</th>
              <th className="tempo-grid-logged-header">Logged</th>
              {columns.map(col => (
                <th
                  key={col.date}
                  className={`tempo-grid-day-header ${col.isWeekend ? 'weekend' : ''} ${col.isToday ? 'today' : ''}`}
                >
                  <span className="tempo-grid-day-num">{String(col.dayNum).padStart(2, '0')}</span>
                  <span className="tempo-grid-day-label">{col.dayLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issueSummaries.map(issue => (
              <tr key={issue.issueKey} className="tempo-grid-row">
                <td className="tempo-grid-issue-cell" title={issue.issueSummary}>
                  {issue.issueSummary}
                </td>
                <td className="tempo-grid-key-cell">
                  <span className="tempo-issue-pill">{issue.issueKey}</span>
                </td>
                <td className="tempo-grid-logged-cell">{issue.totalHours}</td>
                {columns.map(col => {
                  const hours = issue.hoursByDate[col.date] || 0
                  const cellWorklogs = hours > 0
                    ? findWorklogsForCell(worklogs, issue.issueKey, col.date)
                    : []

                  return (
                    <td
                      key={col.date}
                      className={`tempo-grid-cell ${col.isWeekend ? 'weekend' : ''} ${col.isToday ? 'today' : ''} ${hours > 0 ? 'has-hours' : ''}`}
                      onClick={() => {
                        if (cellWorklogs.length === 1) {
                          onWorklogEdit(cellWorklogs[0])
                        } else if (hours === 0) {
                          onCellClick(col.date)
                        }
                      }}
                      onContextMenu={e => {
                        if (cellWorklogs.length === 1) {
                          e.preventDefault()
                          onWorklogDelete(cellWorklogs[0])
                        }
                      }}
                      title={
                        hours > 0
                          ? `${issue.issueKey} · ${hours}h on ${col.date}`
                          : `Click to log time on ${col.date}`
                      }
                    >
                      {hours > 0 ? hours : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="tempo-grid-totals">
              <td className="tempo-grid-total-label" colSpan={2}>Total</td>
              <td className="tempo-grid-total-logged">{totalHours}</td>
              {columns.map(col => {
                const dayTotal = dailyTotals[col.date] || 0
                return (
                  <td
                    key={col.date}
                    className={`tempo-grid-total-cell ${col.isWeekend ? 'weekend' : ''} ${col.isToday ? 'today' : ''} ${dayTotal >= 8 ? 'full' : dayTotal > 0 ? 'partial' : ''}`}
                  >
                    {dayTotal > 0 ? dayTotal : 0}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
