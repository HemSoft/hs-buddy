import { Check } from 'lucide-react'
import type { TempoWorklog } from '../../types/tempo'
import { isModKey, modLabel } from '../../utils/platform'
import type { DayColumn } from './TempoTimesheetGrid'

function buildTotalCellClass(col: DayColumn, isDayComplete: boolean, dayTotal: number): string {
  return [
    'tempo-grid-total-cell',
    col.isWeekend ? 'weekend' : '',
    col.isHoliday ? 'holiday' : '',
    col.isToday ? 'today' : '',
    totalCellCompletionClass(isDayComplete, dayTotal),
  ]
    .filter(Boolean)
    .join(' ')
}

function totalCellCompletionClass(isDayComplete: boolean, dayTotal: number): string {
  if (isDayComplete) return 'full'
  return dayTotal > 0 ? 'partial' : ''
}

function renderTotalCellContent(isDayComplete: boolean, dayTotal: number) {
  if (isDayComplete) return <Check size={14} className="tempo-day-check" />
  return dayTotal > 0 ? dayTotal : 0
}

export function TimesheetFooterRow({
  columns,
  totalHours,
  dailyTotals,
  worklogs,
  showTooltip,
  hideTooltip,
  onCopyToToday,
}: {
  columns: DayColumn[]
  totalHours: number
  dailyTotals: Record<string, number>
  worklogs: TempoWorklog[]
  showTooltip: (e: React.MouseEvent, text: string) => void
  hideTooltip: () => void
  onCopyToToday: (worklogs: TempoWorklog[]) => void
}) {
  const handleTotalClick = (event: React.MouseEvent, col: DayColumn, dayTotal: number) => {
    if (!isModKey(event) || dayTotal <= 0) return
    onCopyToToday(worklogs.filter(w => w.date === col.date))
  }

  const handleTotalKeyDown = (event: React.KeyboardEvent, col: DayColumn, dayTotal: number) => {
    if (dayTotal <= 0 || (event.key !== 'Enter' && event.key !== ' ')) return
    // Keyboard activation must require the same platform modifier as mouse click
    // (see handleTotalClick) — otherwise Enter/Space would trigger the
    // copy-all-worklogs-to-today action without the confirmation the tooltip
    // and mouse handler both advertise.
    if (!isModKey(event)) return
    event.preventDefault()
    onCopyToToday(worklogs.filter(w => w.date === col.date))
  }

  const handleTotalMouseEnter = (event: React.MouseEvent, dayTotal: number) => {
    if (dayTotal <= 0) return
    showTooltip(event, `${dayTotal}h total\n${modLabel}+click — copy all worklogs to today`)
  }

  return (
    <tr className="tempo-grid-totals">
      <td className="tempo-grid-total-label">Total</td>
      <td className="tempo-grid-total-key" aria-label="Total row"></td>
      <td className="tempo-grid-total-logged">{totalHours}</td>
      {columns.map(col => {
        const dayTotal = dailyTotals[col.date] || 0
        const isDayComplete = dayTotal >= 8
        const totalLabel = `${col.date} total ${dayTotal} hours`
        return (
          <td
            key={col.date}
            aria-label={dayTotal > 0 ? undefined : totalLabel}
            className={`${buildTotalCellClass(col, isDayComplete, dayTotal)} ${
              dayTotal > 0 ? 'actionable' : ''
            }`.trim()}
            onMouseEnter={e => {
              handleTotalMouseEnter(e, dayTotal)
            }}
            onMouseLeave={hideTooltip}
            style={dayTotal > 0 ? { cursor: 'copy' } : undefined}
          >
            {dayTotal > 0 ? (
              <button
                type="button"
                className="tempo-grid-total-btn"
                aria-label={`${totalLabel}. ${modLabel}+click or ${modLabel}+Enter to copy all worklogs to today.`}
                tabIndex={0}
                onClick={e => {
                  handleTotalClick(e, col, dayTotal)
                }}
                onKeyDown={e => {
                  handleTotalKeyDown(e, col, dayTotal)
                }}
              >
                {renderTotalCellContent(isDayComplete, dayTotal)}
              </button>
            ) : (
              renderTotalCellContent(isDayComplete, dayTotal)
            )}
          </td>
        )
      })}
    </tr>
  )
}
