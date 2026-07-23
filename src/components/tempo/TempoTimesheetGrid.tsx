import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { TempoIssueSummary, TempoWorklog } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'
import { isModKey, modLabel } from '../../utils/platform'
import { getHoursClasses } from '../../utils/tempoUtils'
import { Copy, Loader2 } from 'lucide-react'
import { TimesheetFooterRow } from './TimesheetFooterRow'

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

export interface DayColumn {
  date: string // YYYY-MM-DD
  dayNum: number
  dayLabel: string // MON, TUE, ...
  isWeekend: boolean
  isToday: boolean
  isHoliday: boolean
  holidayName?: string
}

function buildDayHeaderClass(col: DayColumn): string {
  return [
    'tempo-grid-day-header',
    col.isWeekend ? 'weekend' : '',
    col.isHoliday ? 'holiday' : '',
    col.isToday ? 'today' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function dayHeaderLabel(col: DayColumn): string {
  return col.isHoliday ? '🎉' : col.dayLabel
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
  lines.push(`${modLabel}+click — copy to today`)
  return lines.join('\n')
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
          type="button"
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

function TimesheetRow({
  issue,
  columns,
  worklogs,
  isCapex,
  showTooltip,
  hideTooltip,
  onCellClick,
  onWorklogEdit,
  onWorklogDelete,
  onCopyToToday,
}: {
  issue: TempoIssueSummary
  columns: DayColumn[]
  worklogs: TempoWorklog[]
  isCapex: boolean
  showTooltip: (e: React.MouseEvent, text: string) => void
  hideTooltip: () => void
  onCellClick: (date: string, issueKey?: string) => void
  onWorklogEdit: (worklog: TempoWorklog) => void
  onWorklogDelete: (worklog: TempoWorklog) => void
  onCopyToToday: (worklogs: TempoWorklog[]) => void
}) {
  const handleCellClick = (
    event: React.MouseEvent | React.KeyboardEvent,
    col: DayColumn,
    issueKey: string,
    hours: number,
    cellWorklogs: TempoWorklog[]
  ) => {
    if (isModKey(event) && cellWorklogs.length > 0) {
      onCopyToToday(cellWorklogs)
      return
    }
    if (cellWorklogs.length === 1) {
      onWorklogEdit(cellWorklogs[0])
      return
    }
    if (hours === 0) onCellClick(col.date, issueKey)
  }

  return (
    <tr className={`tempo-grid-row ${isCapex ? 'capex' : ''}`}>
      <td className="tempo-grid-issue-cell" title={issue.issueSummary}>
        {issue.issueSummary}
      </td>
      <td className="tempo-grid-key-cell">
        <span className={`tempo-issue-pill ${isCapex ? 'capex' : ''}`}>{issue.issueKey}</span>
      </td>
      <td className="tempo-grid-logged-cell">{issue.totalHours}</td>
      {columns.map(col => (
        <TimesheetCell
          key={col.date}
          col={col}
          issue={issue}
          worklogs={worklogs}
          isCapex={isCapex}
          onClick={handleCellClick}
          onWorklogDelete={onWorklogDelete}
          showTooltip={showTooltip}
          hideTooltip={hideTooltip}
        />
      ))}
    </tr>
  )
}

function TimesheetCell({
  col,
  issue,
  worklogs,
  isCapex,
  onClick,
  onWorklogDelete,
  showTooltip,
  hideTooltip,
}: {
  col: DayColumn
  issue: TempoIssueSummary
  worklogs: TempoWorklog[]
  isCapex: boolean
  onClick: (
    event: React.MouseEvent | React.KeyboardEvent,
    col: DayColumn,
    issueKey: string,
    hours: number,
    cellWorklogs: TempoWorklog[]
  ) => void
  onWorklogDelete: (worklog: TempoWorklog) => void
  showTooltip: (e: React.MouseEvent, text: string) => void
  hideTooltip: () => void
}) {
  const hours = issue.hoursByDate[col.date] || 0
  const cellWorklogs = hours > 0 ? findWorklogsForCell(worklogs, issue.issueKey, col.date) : []
  const cellLabel = buildCellTitle(issue.issueKey, hours, col.date, cellWorklogs.length)

  return (
    <td
      className={getCellClassName(col, hours, isCapex)}
      onMouseEnter={e =>
        showTooltip(e, buildCellTooltip(issue.issueKey, hours, col, cellWorklogs.length))
      }
      onMouseLeave={hideTooltip}
    >
      <button
        type="button"
        className="tempo-grid-cell-btn"
        title={cellLabel}
        aria-label={cellLabel}
        tabIndex={0}
        onClick={e => onClick(e, col, issue.issueKey, hours, cellWorklogs)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick(e, col, issue.issueKey, hours, cellWorklogs)
          }
        }}
        onContextMenu={e => handleCellContextMenu(e, cellWorklogs, onWorklogDelete)}
      >
        {hours > 0 ? hours : ''}
      </button>
    </td>
  )
}

function buildCellTitle(
  issueKey: string,
  hours: number,
  date: string,
  worklogCount: number
): string {
  if (hours === 0) return `Click to log time on ${date}`

  const deleteHint = worklogCount === 1 ? '\nRight-click to delete' : ''
  return `${issueKey} · ${hours}h on ${date}${deleteHint}\n${modLabel}+click to copy to today`
}

function handleCellContextMenu(
  event: React.MouseEvent,
  cellWorklogs: TempoWorklog[],
  onWorklogDelete: (worklog: TempoWorklog) => void
): void {
  if (cellWorklogs.length !== 1) return
  event.preventDefault()
  onWorklogDelete(cellWorklogs[0])
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
    if (todayRef.current && scrollRef.current) {
      const container = scrollRef.current
      const cell = todayRef.current
      const cellRect = cell.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      // Sticky columns (Issue + Key + Logged) overlay ~320px of the visible area
      const stickyWidth = 320
      // Check if today is already visible in the non-sticky area
      const visibleLeft = containerRect.left + stickyWidth
      const visibleRight = containerRect.right
      /* v8 ignore start */
      const isTodayVisible = cellRect.left >= visibleLeft && cellRect.right <= visibleRight
      if (!isTodayVisible) {
        /* v8 ignore stop */
        const absoluteLeft = cellRect.left - containerRect.left + container.scrollLeft
        // Show one extra column before today so yesterday's data is visible and clickable
        const oneColumnWidth = 40
        container.scrollLeft = Math.max(0, absoluteLeft - stickyWidth - oneColumnWidth)
      }
    }
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
              {columns.map(col => (
                <th
                  key={col.date}
                  ref={col.isToday ? todayRef : undefined}
                  className={buildDayHeaderClass(col)}
                  title={col.holidayName}
                >
                  <span className="tempo-grid-day-num">{String(col.dayNum).padStart(2, '0')}</span>
                  <span className="tempo-grid-day-label">{dayHeaderLabel(col)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issueSummaries.map(issue => (
              <TimesheetRow
                key={issue.issueKey}
                issue={issue}
                columns={columns}
                worklogs={worklogs}
                isCapex={capexMap[issue.issueKey]}
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
                onCellClick={onCellClick}
                onWorklogEdit={onWorklogEdit}
                onWorklogDelete={onWorklogDelete}
                onCopyToToday={onCopyToToday}
              />
            ))}
          </tbody>
          <tfoot>
            <TimesheetFooterRow
              columns={columns}
              totalHours={totalHours}
              dailyTotals={dailyTotals}
              worklogs={worklogs}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
              onCopyToToday={onCopyToToday}
            />
          </tfoot>
        </table>
      </div>
    </div>
  )
}
