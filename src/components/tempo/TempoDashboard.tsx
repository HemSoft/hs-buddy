import { useCallback, useMemo, useReducer } from 'react'
import { TempoSummaryCards } from './TempoSummaryCards'
import { TempoTimesheetGrid } from './TempoTimesheetGrid'
import { TempoWorklogEditor } from './TempoWorklogEditor'
import { nextStartTime } from './tempoUtils'
import {
  useTempoMonth,
  useTempoToday,
  useTempoActions,
  useCapexMap,
  useUserSchedule,
  getMonthRange,
} from '../../hooks/useTempo'
import type { TempoWorklog, CreateWorklogPayload } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'
import { RefreshCw, ChevronLeft, ChevronRight, Plus, Calendar, Grid3X3, List } from 'lucide-react'
import './TempoDashboard.css'

type ViewMode = 'grid' | 'timeline'

interface TempoDashboardState {
  viewMonth: Date
  viewMode: ViewMode
  editorOpen: boolean
  editingWorklog: TempoWorklog | null
  editorDate: string | null
  actionError: string | null
}

type TempoDashboardAction =
  | { type: 'setViewMode'; viewMode: ViewMode }
  | { type: 'openCreate'; date: string }
  | { type: 'openEdit'; worklog: TempoWorklog }
  | { type: 'closeEditor' }
  | { type: 'setActionError'; error: string | null }
  | { type: 'shiftMonth'; delta: number }
  | { type: 'goToCurrentMonth' }

const TEMPO_VIEW_KEY = 'viewMode:tempo'

function createInitialDashboardState(): TempoDashboardState {
  let savedMode: ViewMode = 'grid'
  try {
    const stored = localStorage.getItem(TEMPO_VIEW_KEY)
    if (stored === 'grid' || stored === 'timeline') savedMode = stored
  } catch { /* ignore */ }
  return {
    viewMonth: new Date(),
    viewMode: savedMode,
    editorOpen: false,
    editingWorklog: null,
    editorDate: null,
    actionError: null,
  }
}

function tempoDashboardReducer(
  state: TempoDashboardState,
  action: TempoDashboardAction
): TempoDashboardState {
  switch (action.type) {
    case 'setViewMode':
      try { localStorage.setItem(TEMPO_VIEW_KEY, action.viewMode) } catch { /* ignore */ }
      return { ...state, viewMode: action.viewMode }
    case 'openCreate':
      return {
        ...state,
        editorOpen: true,
        editingWorklog: null,
        editorDate: action.date,
      }
    case 'openEdit':
      return {
        ...state,
        editorOpen: true,
        editingWorklog: action.worklog,
        editorDate: null,
      }
    case 'closeEditor':
      return {
        ...state,
        editorOpen: false,
        editingWorklog: null,
        editorDate: null,
      }
    case 'setActionError':
      return { ...state, actionError: action.error }
    case 'shiftMonth':
      return {
        ...state,
        viewMonth: new Date(
          state.viewMonth.getFullYear(),
          state.viewMonth.getMonth() + action.delta,
          1
        ),
      }
    case 'goToCurrentMonth':
      return { ...state, viewMonth: new Date() }
  }
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function TempoDashboard() {
  const [state, dispatch] = useReducer(
    tempoDashboardReducer,
    undefined,
    createInitialDashboardState
  )
  const todayKey = formatDateKey(new Date())
  const activeEditorDate = state.editorDate || state.editingWorklog?.date || todayKey

  const { from, to } = useMemo(() => getMonthRange(state.viewMonth), [state.viewMonth])

  const month = useTempoMonth(from, to)
  const today = useTempoToday()
  const { schedule } = useUserSchedule(from, to)

  const monthTarget = useMemo(
    () => schedule.reduce((sum, d) => sum + d.requiredSeconds, 0) / 3600,
    [schedule]
  )

  const holidays = useMemo(() => {
    const map: Record<string, string> = {}
    for (const d of schedule) {
      if (d.type === 'HOLIDAY' && d.holidayName) map[d.date] = d.holidayName
    }
    return map
  }, [schedule])

  const refreshAll = useCallback(() => {
    month.refresh()
    today.refresh()
  }, [month, today])

  const actions = useTempoActions(refreshAll)

  const issueKeys = useMemo(
    () => [...new Set(month.worklogs.map(w => w.issueKey))],
    [month.worklogs]
  )
  const capexMap = useCapexMap(issueKeys)

  const prevMonth = () => dispatch({ type: 'shiftMonth', delta: -1 })
  const nextMonth = () => dispatch({ type: 'shiftMonth', delta: 1 })
  const goToCurrentMonth = () => dispatch({ type: 'goToCurrentMonth' })

  const handleEdit = (worklog: TempoWorklog) => {
    dispatch({ type: 'openEdit', worklog })
  }

  const handleDelete = async (worklog: TempoWorklog) => {
    dispatch({ type: 'setActionError', error: null })
    const result = await actions.remove(worklog.id)
    if (!result.success) {
      dispatch({ type: 'setActionError', error: result.error || 'Delete failed' })
    }
  }

  const handleAddForDate = (date: string) => {
    dispatch({ type: 'openCreate', date })
  }

  const handleEditorSave = async (payload: CreateWorklogPayload) => {
    let result
    if (state.editingWorklog) {
      result = await actions.update(state.editingWorklog.id, {
        hours: payload.hours,
        date: payload.date,
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
    dispatch({ type: 'closeEditor' })
  }

  const handleCopyToToday = async (sourceWorklogs: TempoWorklog[]) => {
    dispatch({ type: 'setActionError', error: null })
    const todayWorklogs = month.worklogs.filter(w => w.date === todayKey)
    let offset = todayWorklogs.slice()

    for (const src of sourceWorklogs) {
      const startTime = nextStartTime(offset)
      const result = await actions.create({
        issueKey: src.issueKey,
        hours: src.hours,
        date: todayKey,
        startTime,
        description: src.description,
        accountKey: src.accountKey,
      })
      if (!result.success) {
        dispatch({ type: 'setActionError', error: result.error || 'Copy failed' })
        return
      }
      offset = [...offset, { ...src, date: todayKey, startTime }]
    }
  }

  const isCurrentMonth =
    state.viewMonth.getFullYear() === new Date().getFullYear() &&
    state.viewMonth.getMonth() === new Date().getMonth()

  return (
    <div className="tempo-dashboard">
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
            <span>{formatMonthLabel(state.viewMonth)}</span>
          </button>
          <button className="tempo-nav-btn" onClick={nextMonth} title="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="tempo-header-right">
          <div className="tempo-view-toggle">
            <button
              className={`tempo-view-btn ${state.viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'setViewMode', viewMode: 'grid' })}
              title="Grid view"
            >
              <Grid3X3 size={14} />
            </button>
            <button
              className={`tempo-view-btn ${state.viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'setViewMode', viewMode: 'timeline' })}
              title="List view"
            >
              <List size={14} />
            </button>
          </div>
          <button
            className="tempo-action-btn"
            onClick={() => handleAddForDate(todayKey)}
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

      <TempoSummaryCards
        todayHours={today.data?.totalHours || 0}
        monthHours={month.totalHours}
        monthTarget={monthTarget}
        isCurrentMonth={isCurrentMonth}
        viewMonth={state.viewMonth}
        worklogs={month.worklogs}
        capexMap={capexMap}
      />

      {(month.error || state.actionError) && (
        <div className="tempo-error">
          <span>⚠ {month.error || state.actionError}</span>
          {month.error ? (
            <button onClick={refreshAll}>Retry</button>
          ) : (
            <button onClick={() => dispatch({ type: 'setActionError', error: null })}>
              Dismiss
            </button>
          )}
        </div>
      )}

      {state.viewMode === 'grid' ? (
        <TempoTimesheetGrid
          issueSummaries={month.issueSummaries}
          worklogs={month.worklogs}
          totalHours={month.totalHours}
          monthDate={state.viewMonth}
          holidays={holidays}
          loading={month.loading}
          capexMap={capexMap}
          onCellClick={handleAddForDate}
          onWorklogEdit={handleEdit}
          onWorklogDelete={handleDelete}
          onCopyToToday={handleCopyToToday}
        />
      ) : (
        <div className="tempo-timeline-view">
          {month.worklogs.length === 0 && !month.loading ? (
            <div className="tempo-empty">
              <p>No worklogs for {formatMonthLabel(state.viewMonth)}</p>
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
                      <button onClick={() => handleEdit(w)} title="Edit">
                        ✎
                      </button>
                      <button onClick={() => handleDelete(w)} title="Delete">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {state.editorOpen && (
        <TempoWorklogEditor
          worklog={state.editingWorklog}
          defaultDate={state.editorDate || todayKey}
          existingWorklogs={month.worklogs.filter(w => w.date === activeEditorDate)}
          onSave={handleEditorSave}
          onCancel={() => dispatch({ type: 'closeEditor' })}
        />
      )}
    </div>
  )
}
