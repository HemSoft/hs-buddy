import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { TempoIssueSummary, TempoWorklog } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'
import { isModKey, modLabel } from '../../utils/platform'
import { getHoursClasses } from '../../utils/tempoUtils'
import { Check, Copy, Loader2 } from 'lucide-react'

interface TooltipState {
  text: string
  x: number
  y: number
}

function buildTooltipLines(text: string) {
  const occurrences = new Map<string, number>()

  return text.split('\n').map((line, lineIndex) => {
    const occurrence = occurrences.get(line) ?? 0
    occurrences.set(line, occurrence + 1)

    return {
      isHeader: lineIndex === 0,
      key: `${line}-${occurrence}`,
      line,
    }
  })
}

function CellTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip) return null
  return createPortal(
    <div className="tempo-cell-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      {buildTooltipLines(tooltip.text).map(({ isHeader, key, line }) => (
        <div key={key} className={isHeader ? 'tempo-tooltip-header' : 'tempo-tooltip-action'}>
          {line}
        </div>
      ))}
    </div>,
    document.body
  )
}

interface TempoTimesheetGridProps {
  issueSummaries: TempoIssueSummary[]
  worklogs: TempoWorklog[]
  totalHours: number
  monthDate: Date
  holidays: Record<string, string>
  loading: boolean
  loadingTemplates?: boolean
  capexMap: Record<string, boolean>
  onCellClick: (date: string, issueKey?: string) => void
  onWorklogEdit: (worklog: TempoWorklog) => void
  onWorklogDelete: (worklog: TempoWorklog) => void
  onCopyToToday: (worklogs: TempoWorklog[]) => void
  onCopyFromPreviousMonth?: () => void
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

function buildDayStateClasses(col: DayColumn): string[] {
  return [col.isWeekend && 'weekend', col.isHoliday && 'holiday', col.isToday && 'today'].filter(
    Boolean
  ) as string[]
}

function buildCompletionStateClass(isDayComplete: boolean, dayTotal: number): string[] {
  if (isDayComplete) return ['full']
  return dayTotal > 0 ? ['partial'] : []
}

function buildTotalCellClass(col: DayColumn, isDayComplete: boolean, dayTotal: number): string {
  return ['tempo-grid-total-cell', ...buildDayStateClasses(col), ...buildCompletionStateClass(isDayComplete, dayTotal)].join(' ')
}

function renderTotalCellContent(isDayComplete: boolean, dayTotal: number) {
  if (isDayComplete) return <Check size={14} className="tempo-day-check" />
  return dayTotal > 0 ? dayTotal : 0
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

function getCellClassName(col: DayColumn, hours: number, isCapex: boolean): string {
  return [
    'tempo-grid-cell',
    col.isWeekend && 'weekend',
    col.isHoliday && 'holiday',
    col.isToday && 'today',
    ...getHoursClasses(hours, isCapex),
  ]
    .filter(Boolean)
    .join(' ')
}

function buildCellTooltip(
  issueKey: string,
  hours: number,
  col: DayColumn,
  cellWorklogCount: number
): string {
  if (hours === 0) return `Click — log time on ${col.date}`
  const lines = [`${issueKey} · ${hours}h on ${col.date}`, 'Click — edit worklog']
  if (cellWorklogCount === 1) lines.push('Right-click — delete')
  lines.push(`${modLabel}+click — copy to next empty day`)
  return lines.join('\n')
}

function GridLoadingSkeleton() {
  return (
    <div className="tempo-grid-loading">
      <div className="tempo-grid-skeleton" />
      <div className="tempo-grid-skeleton" />
      <div className="tempo-grid-skeleton" />
    </div>
  )
}

function GridEmptyState({
  onCopyFromPreviousMonth,
  loadingTemplates,
}: {
  onCopyFromPreviousMonth?: (() => void) | undefined
  loadingTemplates?: boolean
}) {
  return (
    <div className="tempo-empty">
      <p>No worklogs this month. Click a cell or use Quick Log to get started.</p>
      {onCopyFromPreviousMonth && (
        <button
          className="tempo-copy-from-prev-btn"
          onClick={onCopyFromPreviousMonth}
          disabled={loadingTemplates}
        >
          {loadingTemplates ? <Loader2 size={14} className="spinning" /> : <Copy size={14} />}
          <span>{loadingTemplates ? 'Loading…' : 'Copy entries from last month'}</span>
        </button>
      )}
    </div>
  )
}

function scrollTodayCellIntoView(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  todayRef: React.RefObject<HTMLTableCellElement | null>
) {
  if (!todayRef.current || !scrollRef.current) return
  const container = scrollRef.current
  const cell = todayRef.current
  const cellRect = cell.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const stickyWidth = 320
  const visibleLeft = containerRect.left + stickyWidth
  const visibleRight = containerRect.right
  const isTodayVisible = cellRect.left >= visibleLeft && cellRect.right <= visibleRight
  if (isTodayVisible) return
  const absoluteLeft = cellRect.left - containerRect.left + container.scrollLeft
  const oneColumnWidth = 40
  container.scrollLeft = Math.max(0, absoluteLeft - stickyWidth - oneColumnWidth)
}

function TempoIssueRow({
  issue,
  columns,
  worklogs,
  isCapex,
  hideTooltip,
  showTooltip,
  onCellClick,
  onWorklogEdit,
  onWorklogDelete,
  onCopyToToday,
}: {
  issue: TempoIssueSummary
  columns: DayColumn[]
  worklogs: TempoWorklog[]
  isCapex: boolean
  hideTooltip: () => void
  showTooltip: (e: React.MouseEvent, text: string) => void
  onCellClick: (date: string, issueKey?: string) => void
  onWorklogEdit: (worklog: TempoWorklog) => void
  onWorklogDelete: (worklog: TempoWorklog) => void
  onCopyToToday: (worklogs: TempoWorklog[]) => void
}) {
  return (
    <tr className={`tempo-grid-row ${isCapex ? 'capex' : ''}`}>
      <td className="tempo-grid-issue-cell" title={issue.issueSummary}>
        {issue.issueSummary}
      </td>
      <td className="tempo-grid-key-cell">
        <span className={`tempo-issue-pill ${isCapex ? 'capex' : ''}`}>{issue.issueKey}</span>
      </td>
      <td className="tempo-grid-logged-cell">{issue.totalHours}</td>
      {columns.map(col => {
        const hours = issue.hoursByDate[col.date] || 0
        const cellWorklogs = hours > 0 ? findWorklogsForCell(worklogs, issue.issueKey, col.date) : []

        return (
          <td
            key={col.date}
            className={getCellClassName(col, hours, isCapex)}
            title={buildCellTooltip(issue.issueKey, hours, col, cellWorklogs.length)}
            onClick={e => {
              if (isModKey(e) && cellWorklogs.length > 0) {
                onCopyToToday(cellWorklogs)
              } else if (cellWorklogs.length === 1) {
                onWorklogEdit(cellWorklogs[0])
              } else if (hours === 0) {
                onCellClick(col.date, issue.issueKey)
              }
            }}
            onContextMenu={e => {
              if (cellWorklogs.length === 1) {
                e.preventDefault()
                onWorklogDelete(cellWorklogs[0])
              }
            }}
            onMouseEnter={e =>
              showTooltip(e, buildCellTooltip(issue.issueKey, hours, col, cellWorklogs.length))
            }
            onMouseLeave={hideTooltip}
          >
            {hours > 0 ? hours : ''}
          </td>
        )
      })}
    </tr>
  )
}

function dayHeaderClassName(col: DayColumn): string {
  return `tempo-grid-day-header ${col.isWeekend ? 'weekend' : ''} ${col.isHoliday ? 'holiday' : ''} ${col.isToday ? 'today' : ''}`
}

function dayHeaderLabel(col: DayColumn): string {
  return col.isHoliday ? '🎉' : col.dayLabel
}

function DayHeaderCell({
  col,
  todayRef,
}: {
  col: DayColumn
  todayRef: React.RefObject<HTMLTableCellElement | null>
}) {
  return (
    <th
      key={col.date}
      ref={col.isToday ? todayRef : undefined}
      className={dayHeaderClassName(col)}
      title={col.holidayName}
    >
      <span className="tempo-grid-day-num">{String(col.dayNum).padStart(2, '0')}</span>
      <span className="tempo-grid-day-label">{dayHeaderLabel(col)}</span>
    </th>
  )
}

function DayHeaderCells({
  columns,
  todayRef,
}: {
  columns: DayColumn[]
  todayRef: React.RefObject<HTMLTableCellElement | null>
}) {
  return columns.map(col => <DayHeaderCell key={col.date} col={col} todayRef={todayRef} />)
}

function TempoTotalRow({
  columns,
  totalHours,
  dailyTotals,
  worklogs,
  hideTooltip,
  showTooltip,
  onCopyToToday,
}: {
  columns: DayColumn[]
  totalHours: number
  dailyTotals: Record<string, number>
  worklogs: TempoWorklog[]
  hideTooltip: () => void
  showTooltip: (e: React.MouseEvent, text: string) => void
  onCopyToToday: (worklogs: TempoWorklog[]) => void
}) {
  return (
    <tr className="tempo-grid-totals">
      <td className="tempo-grid-total-label">Total</td>
      <td className="tempo-grid-total-key"></td>
      <td className="tempo-grid-total-logged">{totalHours}</td>
      {columns.map(col => {
        const dayTotal = dailyTotals[col.date] || 0
        const isDayComplete = dayTotal >= 8
        return (
          <td
            key={col.date}
            className={buildTotalCellClass(col, isDayComplete, dayTotal)}
            onClick={e => {
              if (isModKey(e) && dayTotal > 0) {
                onCopyToToday(worklogs.filter(w => w.date === col.date))
              }
            }}
            onMouseEnter={e => {
              if (dayTotal > 0) {
                showTooltip(e, `${dayTotal}h total\n${modLabel}+click — copy all worklogs to next empty day`)
              }
            }}
            onMouseLeave={hideTooltip}
            style={dayTotal > 0 ? { cursor: 'copy' } : undefined}
          >
            {renderTotalCellContent(isDayComplete, dayTotal)}
          </td>
        )
      })}
    </tr>
  )
}

export function TempoTimesheetGrid({
  issueSummaries,
  worklogs,
  totalHours,
  monthDate,
  holidays,
  loading,
  loadingTemplates,
  capexMap,
  onCellClick,
  onWorklogEdit,
  onWorklogDelete,
  onCopyToToday,
  onCopyFromPreviousMonth,
}: TempoTimesheetGridProps) {
  const columns = useMemo(() => buildDayColumns(monthDate, holidays), [monthDate, holidays])

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const showTooltip = useCallback((e: React.MouseEvent, text: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 4,
    })
  }, [])

  const hideTooltip = useCallback(() => setTooltip(null), [])

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
    scrollTodayCellIntoView(scrollRef, todayRef)
  }, [columns, loading, issueSummaries.length])

  // Hide tooltip when the grid scrolls
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setTooltip(null)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  if (loading && issueSummaries.length === 0) {
    return <GridLoadingSkeleton />
  }

  if (!loading && issueSummaries.length === 0) {
    return (
      <GridEmptyState
        onCopyFromPreviousMonth={onCopyFromPreviousMonth}
        loadingTemplates={loadingTemplates}
      />
    )
  }

  return (
    <div className="tempo-grid-wrapper">
      <CellTooltip tooltip={tooltip} />
      <div className="tempo-grid-scroll" ref={scrollRef}>
        <table className="tempo-grid">
          <thead>
            <tr>
              <th className="tempo-grid-issue-header">Issue</th>
              <th className="tempo-grid-key-header">Key</th>
              <th className="tempo-grid-logged-header">Logged</th>
              <DayHeaderCells columns={columns} todayRef={todayRef} />
            </tr>
          </thead>
          <tbody>
            {issueSummaries.map(issue => (
              <TempoIssueRow
                key={issue.issueKey}
                issue={issue}
                columns={columns}
                worklogs={worklogs}
                isCapex={capexMap[issue.issueKey]}
                hideTooltip={hideTooltip}
                showTooltip={showTooltip}
                onCellClick={onCellClick}
                onWorklogEdit={onWorklogEdit}
                onWorklogDelete={onWorklogDelete}
                onCopyToToday={onCopyToToday}
              />
            ))}
          </tbody>
          <tfoot>
            <TempoTotalRow
              columns={columns}
              totalHours={totalHours}
              dailyTotals={dailyTotals}
              worklogs={worklogs}
              hideTooltip={hideTooltip}
              showTooltip={showTooltip}
              onCopyToToday={onCopyToToday}
            />
          </tfoot>
        </table>
      </div>
    </div>
  )
}
