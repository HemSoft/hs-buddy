import { useMemo, useRef, useEffect } from 'react'
import type { TempoIssueSummary, TempoWorklog } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'
import { Check } from 'lucide-react'

interface TempoTimesheetGridProps {
  issueSummaries: TempoIssueSummary[]
  worklogs: TempoWorklog[]
  totalHours: number
  monthDate: Date
  holidays: Record<string, string>
  loading: boolean
  capexMap: Record<string, boolean>
  onCellClick: (date: string) => void
  onWorklogEdit: (worklog: TempoWorklog) => void
  onWorklogDelete: (worklog: TempoWorklog) => void
  onCopyToToday: (worklogs: TempoWorklog[]) => void
}

interface DayColumn {
  date: string // YYYY-MM-DD
  dayNum: number
  dayLabel: string // MON, TUE, ...
  isWeekend: boolean
  isToday: boolean
  isHoliday: boolean
  holidayName?: string
}

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function buildDayColumns(monthDate: Date, holidays: Record<string, string>): DayColumn[] {
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
      isHoliday: dateStr in holidays,
      holidayName: holidays[dateStr],
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
  holidays,
  loading,
  capexMap,
  onCellClick,
  onWorklogEdit,
  onWorklogDelete,
  onCopyToToday,
}: TempoTimesheetGridProps) {
  const columns = useMemo(() => buildDayColumns(monthDate, holidays), [monthDate, holidays])

  // Compute daily totals
  const dailyTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const w of worklogs) {
      map[w.date] = (map[w.date] || 0) + w.hours
    }
    return map
  }, [worklogs])

  const scrollRef = useRef<HTMLDivElement>(null)
  const todayRef = useRef<HTMLTableCellElement>(null)

  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      const container = scrollRef.current
      const cell = todayRef.current
      // Get the cell's absolute position in the scrollable content
      const cellRect = cell.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const absoluteLeft = cellRect.left - containerRect.left + container.scrollLeft
      // Sticky columns (Issue + Key + Logged) overlay ~320px of the visible area
      // Scroll so today appears just right of them
      const stickyWidth = 320
      container.scrollLeft = Math.max(0, absoluteLeft - stickyWidth)
    }
  }, [columns, loading, issueSummaries.length])

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
      <div className="tempo-grid-scroll" ref={scrollRef}>
        <table className="tempo-grid">
          <thead>
            <tr>
              <th className="tempo-grid-issue-header">Issue</th>
              <th className="tempo-grid-key-header">Key</th>
              <th className="tempo-grid-logged-header">Logged</th>
              {columns.map(col => (
                <th
                  key={col.date}
                  ref={col.isToday ? todayRef : undefined}
                  className={`tempo-grid-day-header ${col.isWeekend ? 'weekend' : ''} ${col.isHoliday ? 'holiday' : ''} ${col.isToday ? 'today' : ''}`}
                  title={col.holidayName}
                >
                  <span className="tempo-grid-day-num">{String(col.dayNum).padStart(2, '0')}</span>
                  <span className="tempo-grid-day-label">{col.isHoliday ? '🎉' : col.dayLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issueSummaries.map(issue => {
              const isCapex = capexMap[issue.issueKey]
              return (
              <tr key={issue.issueKey} className={`tempo-grid-row ${isCapex ? 'capex' : ''}`}>
                <td className="tempo-grid-issue-cell" title={issue.issueSummary}>
                  {issue.issueSummary}
                </td>
                <td className="tempo-grid-key-cell">
                  <span className={`tempo-issue-pill ${isCapex ? 'capex' : ''}`}>{issue.issueKey}</span>
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
                      className={`tempo-grid-cell ${col.isWeekend ? 'weekend' : ''} ${col.isHoliday ? 'holiday' : ''} ${col.isToday ? 'today' : ''} ${hours > 0 ? 'has-hours' : ''} ${hours > 0 && isCapex ? 'capex' : ''}`}
                      onClick={e => {
                        if (e.ctrlKey && cellWorklogs.length > 0) {
                          onCopyToToday(cellWorklogs)
                        } else if (cellWorklogs.length === 1) {
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
                          ? `${issue.issueKey} · ${hours}h on ${col.date}\nCtrl+click to copy to today`
                          : `Click to log time on ${col.date}`
                      }
                    >
                      {hours > 0 ? hours : ''}
                    </td>
                  )
                })}
              </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="tempo-grid-totals">
              <td className="tempo-grid-total-label" colSpan={2}>Total</td>
              <td className="tempo-grid-total-logged">{totalHours}</td>
              {columns.map(col => {
                const dayTotal = dailyTotals[col.date] || 0
                const isDayComplete = dayTotal >= 8
                return (
                  <td
                    key={col.date}
                    className={`tempo-grid-total-cell ${col.isWeekend ? 'weekend' : ''} ${col.isHoliday ? 'holiday' : ''} ${col.isToday ? 'today' : ''} ${isDayComplete ? 'full' : dayTotal > 0 ? 'partial' : ''}`}
                    onClick={e => {
                      if (e.ctrlKey && dayTotal > 0) {
                        onCopyToToday(worklogs.filter(w => w.date === col.date))
                      }
                    }}
                    title={dayTotal > 0 ? `${dayTotal}h — Ctrl+click to copy this day to today` : undefined}
                    style={dayTotal > 0 ? { cursor: 'copy' } : undefined}
                  >
                    {isDayComplete ? <Check size={14} className="tempo-day-check" /> : dayTotal > 0 ? dayTotal : 0}
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
