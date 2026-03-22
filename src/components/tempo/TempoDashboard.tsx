import { useState, useMemo, useCallback } from 'react'
import { TempoSummaryCards } from './TempoSummaryCards'
import { TempoTimesheetGrid } from './TempoTimesheetGrid'
import { TempoQuickLog } from './TempoQuickLog'
import { TempoWorklogEditor } from './TempoWorklogEditor'
import {
  useTempoMonth,
  useTempoToday,
  useTempoActions,
  getMonthRange,
} from '../../hooks/useTempo'
import type { TempoWorklog, CreateWorklogPayload } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Grid3X3,
  List,
} from 'lucide-react'
import './TempoDashboard.css'

type ViewMode = 'grid' | 'timeline'

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function getMonthTarget(date: Date): number {
  const y = date.getFullYear()
  const m = date.getMonth()
  let count = 0
  const d = new Date(y, m, 1)
  while (d.getMonth() === m) {
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) count++
    d.setDate(d.getDate() + 1)
  }
  return count * 8
}

export function TempoDashboard() {
  const [viewMonth, setViewMonth] = useState(() => new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingWorklog, setEditingWorklog] = useState<TempoWorklog | null>(null)
  const [editorDate, setEditorDate] = useState<string | null>(null)

  const { from, to } = useMemo(() => getMonthRange(viewMonth), [viewMonth])
  const monthTarget = useMemo(() => getMonthTarget(viewMonth), [viewMonth])

  const month = useTempoMonth(from, to)
  const today = useTempoToday()

  const refreshAll = useCallback(() => {
    month.refresh()
    today.refresh()
  }, [month, today])

  const actions = useTempoActions(refreshAll)

  const prevMonth = () =>
    setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))

  const nextMonth = () =>
    setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  const goToCurrentMonth = () => setViewMonth(new Date())

  const handleEdit = (worklog: TempoWorklog) => {
    setEditingWorklog(worklog)
    setEditorDate(null)
    setEditorOpen(true)
  }

  const [actionError, setActionError] = useState<string | null>(null)

  const handleDelete = async (worklog: TempoWorklog) => {
    setActionError(null)
    const result = await actions.remove(worklog.id)
    if (!result.success) setActionError(result.error || 'Delete failed')
  }

  const handleAddForDate = (date: string) => {
    setEditingWorklog(null)
    setEditorDate(date)
    setEditorOpen(true)
  }

  const handleEditorSave = async (payload: CreateWorklogPayload) => {
    let result
    if (editingWorklog) {
      result = await actions.update(editingWorklog.id, {
        hours: payload.hours,
        startTime: payload.startTime,
        description: payload.description,
        accountKey: payload.accountKey,
      })
    } else {
      result = await actions.create(payload)
    }
    if (!result.success) {
      throw new Error(result.error || 'Save failed')
    }
    setEditorOpen(false)
    setEditingWorklog(null)
    setEditorDate(null)
  }

  const handleQuickLog = async (payload: CreateWorklogPayload) => {
    setActionError(null)
    const result = await actions.create(payload)
    if (!result.success) setActionError(result.error || 'Quick log failed')
    return result
  }

  const isCurrentMonth =
    viewMonth.getFullYear() === new Date().getFullYear() &&
    viewMonth.getMonth() === new Date().getMonth()

  return (
    <div className="tempo-dashboard">
      {/* Header Bar */}
      <div className="tempo-header">
        <div className="tempo-header-left">
          <h2>Tempo Tracking</h2>
        </div>
        <div className="tempo-header-center">
          <button className="tempo-nav-btn" onClick={prevMonth} title="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button
            className="tempo-month-label"
            onClick={goToCurrentMonth}
            title="Go to current month"
          >
            <Calendar size={14} />
            <span>{formatMonthLabel(viewMonth)}</span>
          </button>
          <button className="tempo-nav-btn" onClick={nextMonth} title="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="tempo-header-right">
          <div className="tempo-view-toggle">
            <button
              className={`tempo-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <Grid3X3 size={14} />
            </button>
            <button
              className={`tempo-view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
              title="List view"
            >
              <List size={14} />
            </button>
          </div>
          <button
            className="tempo-action-btn"
            onClick={() => handleAddForDate(formatDateKey(new Date()))}
            title="New worklog"
          >
            <Plus size={14} />
            <span>Log Time</span>
          </button>
          <button
            className={`tempo-action-btn tempo-refresh ${month.loading ? 'spinning' : ''}`}
            onClick={refreshAll}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <TempoSummaryCards
        todayHours={today.data?.totalHours || 0}
        monthHours={month.totalHours}
        monthTarget={monthTarget}
        issueSummaries={month.issueSummaries}
        isCurrentMonth={isCurrentMonth}
      />

      {/* Error State */}
      {(month.error || actionError) && (
        <div className="tempo-error">
          <span>⚠ {month.error || actionError}</span>
          {month.error ? (
            <button onClick={refreshAll}>Retry</button>
          ) : (
            <button onClick={() => setActionError(null)}>Dismiss</button>
          )}
        </div>
      )}

      {/* Main Content */}
      {viewMode === 'grid' ? (
        <TempoTimesheetGrid
          issueSummaries={month.issueSummaries}
          worklogs={month.worklogs}
          totalHours={month.totalHours}
          monthDate={viewMonth}
          loading={month.loading}
          onCellClick={handleAddForDate}
          onWorklogEdit={handleEdit}
          onWorklogDelete={handleDelete}
        />
      ) : (
        <div className="tempo-timeline-view">
          {month.worklogs.length === 0 && !month.loading ? (
            <div className="tempo-empty">
              <p>No worklogs for {formatMonthLabel(viewMonth)}</p>
            </div>
          ) : (
            <table className="tempo-timeline-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Hours</th>
                  <th>Issue</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {month.worklogs.map(w => (
                  <tr key={w.id}>
                    <td className="tempo-tl-date">{w.date}</td>
                    <td className="tempo-tl-time">{w.startTime}</td>
                    <td className="tempo-tl-hours">{w.hours}</td>
                    <td>
                      <span className="tempo-issue-pill">{w.issueKey}</span>
                    </td>
                    <td className="tempo-tl-desc">{w.issueSummary}</td>
                    <td>
                      <span className="tempo-account-badge">{w.accountKey}</span>
                    </td>
                    <td className="tempo-tl-actions">
                      <button onClick={() => handleEdit(w)} title="Edit">✎</button>
                      <button onClick={() => handleDelete(w)} title="Delete">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Quick Log */}
      <TempoQuickLog onLog={handleQuickLog} pending={actions.pending} />

      {/* Editor Modal */}
      {editorOpen && (
        <TempoWorklogEditor
          worklog={editingWorklog}
          defaultDate={editorDate || formatDateKey(new Date())}
          onSave={handleEditorSave}
          onCancel={() => {
            setEditorOpen(false)
            setEditingWorklog(null)
            setEditorDate(null)
          }}
        />
      )}
    </div>
  )
}
