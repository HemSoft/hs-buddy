import { useCallback, useMemo, useReducer } from 'react'
import { TempoDashboardErrorBanner } from './TempoDashboardErrorBanner'
import { TempoDashboardHeader } from './TempoDashboardHeader'
import { TempoSummaryCards } from './TempoSummaryCards'
import { TempoTimelineView } from './TempoTimelineView'
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
import type { TempoWorklog, CreateWorklogPayload, TempoScheduleDay } from '../../types/tempo'
import { formatDateKey } from '../../utils/dateUtils'
import './TempoDashboard.css'

type ViewMode = 'grid' | 'timeline'

interface TempoDashboardState {
  viewMonth: Date
  viewMode: ViewMode
  editorOpen: boolean
  editingWorklog: TempoWorklog | null
  prefillWorklog: TempoWorklog | null
  editorDate: string | null
  actionError: string | null
}

type TempoDashboardAction =
  | { type: 'setViewMode'; viewMode: ViewMode }
  | { type: 'openCreate'; date: string; prefillWorklog: TempoWorklog | null }
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
  } catch {
    /* ignore */
  }
  return {
    viewMonth: new Date(),
    viewMode: savedMode,
    editorOpen: false,
    editingWorklog: null,
    prefillWorklog: null,
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
      try {
        localStorage.setItem(TEMPO_VIEW_KEY, action.viewMode)
      } catch {
        /* ignore */
      }
      return { ...state, viewMode: action.viewMode }
    case 'openCreate':
      return {
        ...state,
        editorOpen: true,
        editingWorklog: null,
        prefillWorklog: action.prefillWorklog,
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
        prefillWorklog: null,
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

function buildHolidayMap(schedule: TempoScheduleDay[]): Record<string, string> {
  const holidays: Record<string, string> = {}
  for (const day of schedule) {
    if (day.type === 'HOLIDAY' && day.holidayName) {
      holidays[day.date] = day.holidayName
    }
  }
  return holidays
}

function findPrefillWorklog(worklogs: TempoWorklog[], issueKey: string): TempoWorklog | null {
  const issueWorklogs = worklogs.filter(worklog => worklog.issueKey === issueKey)
  if (issueWorklogs.length === 0) {
    return null
  }
  return issueWorklogs.reduce((latest, worklog) => (worklog.date > latest.date ? worklog : latest))
}

function selectNextEmptyDay(
  issueKeys: Set<string>,
  sourceDate: string,
  worklogs: TempoWorklog[],
  holidays: Record<string, string>,
  todayKey: string
): string {
  const hoursByIssueDate: Record<string, Set<string>> = {}
  for (const worklog of worklogs) {
    if (!hoursByIssueDate[worklog.date]) {
      hoursByIssueDate[worklog.date] = new Set()
    }
    hoursByIssueDate[worklog.date].add(worklog.issueKey)
  }

  const dailyTotals: Record<string, number> = {}
  for (const worklog of worklogs) {
    dailyTotals[worklog.date] = (dailyTotals[worklog.date] || 0) + worklog.hours
  }

  const holidaySet = new Set(Object.keys(holidays))
  const start = new Date(sourceDate + 'T00:00:00')
  start.setDate(start.getDate() + 1)

  let firstWorkday: string | null = null
  let firstUnfinished: string | null = null

  for (let i = 0; i < 60; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue
    }

    const dateKey = formatDateKey(date)
    if (holidaySet.has(dateKey)) {
      continue
    }

    if (!firstWorkday) {
      firstWorkday = dateKey
    }
    if (!firstUnfinished && (dailyTotals[dateKey] || 0) < 8) {
      firstUnfinished = dateKey
    }

    const dayIssues = hoursByIssueDate[dateKey]
    const hasAnyIssue = dayIssues && [...issueKeys].some(issueKey => dayIssues.has(issueKey))
    if (!hasAnyIssue) {
      return dateKey
    }
  }

  return firstUnfinished || firstWorkday || todayKey
}

export function TempoDashboard() {
  const [state, dispatch] = useReducer(
    tempoDashboardReducer,
    undefined,
    createInitialDashboardState
  )
  const todayKey = formatDateKey(new Date())
  const monthLabel = formatMonthLabel(state.viewMonth)
  const activeEditorDate = state.editorDate || state.editingWorklog?.date || todayKey

  const { from, to } = useMemo(() => getMonthRange(state.viewMonth), [state.viewMonth])

  const month = useTempoMonth(from, to)
  const today = useTempoToday()
  const { schedule } = useUserSchedule(from, to)

  const monthTarget = useMemo(
    () => schedule.reduce((sum, d) => sum + d.requiredSeconds, 0) / 3600,
    [schedule]
  )

  const holidays = useMemo(() => buildHolidayMap(schedule), [schedule])

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

  const handleAddForDate = (date: string, issueKey?: string) => {
    const prefill = issueKey ? findPrefillWorklog(month.worklogs, issueKey) : null
    dispatch({ type: 'openCreate', date, prefillWorklog: prefill })
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

  const findNextEmptyDay = useCallback(
    (issueKeys: Set<string>, sourceDate: string): string => {
      return selectNextEmptyDay(issueKeys, sourceDate, month.worklogs, holidays, todayKey)
    },
    [month.worklogs, holidays, todayKey]
  )

  const handleCopyToDay = async (sourceWorklogs: TempoWorklog[]) => {
    dispatch({ type: 'setActionError', error: null })
    const issueKeys = new Set(sourceWorklogs.map(w => w.issueKey))
    const sourceDate = sourceWorklogs[0].date
    const targetDate = findNextEmptyDay(issueKeys, sourceDate)
    const targetWorklogs = month.worklogs.filter(w => w.date === targetDate)
    let offset = targetWorklogs.slice()

    for (const src of sourceWorklogs) {
      const startTime = nextStartTime(offset)
      const result = await actions.create({
        issueKey: src.issueKey,
        hours: src.hours,
        date: targetDate,
        startTime,
        description: src.description,
        accountKey: src.accountKey,
      })
      if (!result.success) {
        dispatch({ type: 'setActionError', error: result.error || 'Copy failed' })
        return
      }
      offset = [...offset, { ...src, date: targetDate, startTime }]
    }
  }

  const isCurrentMonth =
    state.viewMonth.getFullYear() === new Date().getFullYear() &&
    state.viewMonth.getMonth() === new Date().getMonth()
  const activeError = month.error || state.actionError

  return (
    <div className="tempo-dashboard">
      <TempoDashboardHeader
        monthLabel={monthLabel}
        viewMode={state.viewMode}
        monthLoading={month.loading}
        todayKey={todayKey}
        onPreviousMonth={prevMonth}
        onCurrentMonth={goToCurrentMonth}
        onNextMonth={nextMonth}
        onSetViewMode={viewMode => dispatch({ type: 'setViewMode', viewMode })}
        onAddWorklog={handleAddForDate}
        onRefresh={refreshAll}
      />

      <TempoSummaryCards
        todayHours={today.data?.totalHours || 0}
        monthHours={month.totalHours}
        monthTarget={monthTarget}
        isCurrentMonth={isCurrentMonth}
        viewMonth={state.viewMonth}
        worklogs={month.worklogs}
        capexMap={capexMap}
      />

      {activeError && (
        <TempoDashboardErrorBanner
          error={activeError}
          canRetry={Boolean(month.error)}
          onRetry={refreshAll}
          onDismiss={() => dispatch({ type: 'setActionError', error: null })}
        />
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
          onCopyToToday={handleCopyToDay}
        />
      ) : (
        <TempoTimelineView
          worklogs={month.worklogs}
          loading={month.loading}
          monthLabel={monthLabel}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {state.editorOpen && (
        <TempoWorklogEditor
          worklog={state.editingWorklog}
          defaultDate={state.editorDate || todayKey}
          defaultIssueKey={state.prefillWorklog?.issueKey}
          defaultAccountKey={state.prefillWorklog?.accountKey}
          defaultDescription={state.prefillWorklog?.description}
          existingWorklogs={month.worklogs.filter(w => w.date === activeEditorDate)}
          onSave={handleEditorSave}
          onCancel={() => dispatch({ type: 'closeEditor' })}
        />
      )}
    </div>
  )
}
