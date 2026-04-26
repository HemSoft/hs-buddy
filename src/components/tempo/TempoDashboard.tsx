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
import { sumBy } from '../../utils/arrayUtils'
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

function persistViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(TEMPO_VIEW_KEY, mode)
  } catch {
    /* ignore */
  }
}

type DashboardHandler = (
  state: TempoDashboardState,
  action: TempoDashboardAction
) => TempoDashboardState

const dashboardHandlers: Record<TempoDashboardAction['type'], DashboardHandler> = {
  setViewMode: (s, a) => {
    persistViewMode((a as Extract<TempoDashboardAction, { type: 'setViewMode' }>).viewMode)
    return {
      ...s,
      viewMode: (a as Extract<TempoDashboardAction, { type: 'setViewMode' }>).viewMode,
    }
  },
  openCreate: (s, a) => {
    const act = a as Extract<TempoDashboardAction, { type: 'openCreate' }>
    return {
      ...s,
      editorOpen: true,
      editingWorklog: null,
      prefillWorklog: act.prefillWorklog,
      editorDate: act.date,
    }
  },
  openEdit: (s, a) => ({
    ...s,
    editorOpen: true,
    editingWorklog: (a as Extract<TempoDashboardAction, { type: 'openEdit' }>).worklog,
    editorDate: null,
  }),
  closeEditor: s => ({
    ...s,
    editorOpen: false,
    editingWorklog: null,
    prefillWorklog: null,
    editorDate: null,
  }),
  setActionError: (s, a) => ({
    ...s,
    actionError: (a as Extract<TempoDashboardAction, { type: 'setActionError' }>).error,
  }),
  shiftMonth: (s, a) => ({
    ...s,
    viewMonth: new Date(
      s.viewMonth.getFullYear(),
      s.viewMonth.getMonth() + (a as Extract<TempoDashboardAction, { type: 'shiftMonth' }>).delta,
      1
    ),
  }),
  goToCurrentMonth: s => ({ ...s, viewMonth: new Date() }),
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for testing
export function tempoDashboardReducer(
  state: TempoDashboardState,
  action: TempoDashboardAction
): TempoDashboardState {
  const handler = dashboardHandlers[action.type]
  if (!handler) return state
  return handler(state, action)
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

function buildWorklogIndexes(worklogs: TempoWorklog[]): {
  hoursByIssueDate: Record<string, Set<string>>
  dailyTotals: Record<string, number>
} {
  const hoursByIssueDate: Record<string, Set<string>> = {}
  const dailyTotals: Record<string, number> = {}
  for (const worklog of worklogs) {
    /* v8 ignore start */
    if (!hoursByIssueDate[worklog.date]) {
      /* v8 ignore stop */
      hoursByIssueDate[worklog.date] = new Set()
    }
    hoursByIssueDate[worklog.date].add(worklog.issueKey)
    dailyTotals[worklog.date] = (dailyTotals[worklog.date] || 0) + worklog.hours
  }
  return { hoursByIssueDate, dailyTotals }
}

function isWorkday(date: Date, holidaySet: Set<string>): boolean {
  const dow = date.getDay()
  if (dow === 0 || dow === 6) return false
  return !holidaySet.has(formatDateKey(date))
}

/** Check whether a day has entries for any of the given issue keys. */
function dayHasIssue(
  hoursByIssueDate: Record<string, Set<string>>,
  dateKey: string,
  issueKeys: Set<string>
): boolean {
  const dayIssues = hoursByIssueDate[dateKey]
  return !!dayIssues && [...issueKeys].some(issueKey => dayIssues.has(issueKey))
}

/** Check whether a day's total is below 8h. */
function isDayUnfinished(dailyTotals: Record<string, number>, dateKey: string): boolean {
  return (dailyTotals[dateKey] || 0) < 8
}

function findFirstEmptyDay(
  issueKeys: Set<string>,
  start: Date,
  holidaySet: Set<string>,
  hoursByIssueDate: Record<string, Set<string>>,
  dailyTotals: Record<string, number>
): { dateKey: string | null; firstWorkday: string | null; firstUnfinished: string | null } {
  let firstWorkday: string | null = null
  let firstUnfinished: string | null = null

  for (let i = 0; i < 60; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    if (!isWorkday(date, holidaySet)) continue

    const dateKey = formatDateKey(date)
    if (!firstWorkday) firstWorkday = dateKey
    if (!firstUnfinished && isDayUnfinished(dailyTotals, dateKey)) firstUnfinished = dateKey

    if (!dayHasIssue(hoursByIssueDate, dateKey, issueKeys)) {
      return { dateKey, firstWorkday, firstUnfinished }
    }
  }

  /* v8 ignore start -- defensive fallback when no empty day found within 60-day window */
  return { dateKey: null, firstWorkday, firstUnfinished }
  /* v8 ignore stop */
}

function selectNextEmptyDay(
  issueKeys: Set<string>,
  sourceDate: string,
  worklogs: TempoWorklog[],
  holidays: Record<string, string>,
  todayKey: string
): string {
  const { hoursByIssueDate, dailyTotals } = buildWorklogIndexes(worklogs)
  const holidaySet = new Set(Object.keys(holidays))
  const start = new Date(sourceDate + 'T00:00:00')
  start.setDate(start.getDate() + 1)

  const { dateKey, firstWorkday, firstUnfinished } = findFirstEmptyDay(
    issueKeys,
    start,
    holidaySet,
    hoursByIssueDate,
    dailyTotals
  )

  /* v8 ignore start */
  return dateKey ?? firstUnfinished ?? firstWorkday ?? todayKey
  /* v8 ignore stop */
}

function useTempoDashboardData(viewMonth: Date) {
  const { from, to } = useMemo(() => getMonthRange(viewMonth), [viewMonth])
  const month = useTempoMonth(from, to)
  const today = useTempoToday()
  const { schedule } = useUserSchedule(from, to)

  const monthTarget = useMemo(() => sumBy(schedule, d => d.requiredSeconds) / 3600, [schedule])
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

  return { month, today, monthTarget, holidays, refreshAll, actions, capexMap }
}

function useTempoDashboardHandlers(
  state: TempoDashboardState,
  dispatch: React.Dispatch<TempoDashboardAction>,
  month: ReturnType<typeof useTempoMonth>,
  holidays: Record<string, string>,
  actions: ReturnType<typeof useTempoActions>,
  todayKey: string
) {
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
    const result = state.editingWorklog
      ? await actions.update(state.editingWorklog.id, {
          hours: payload.hours,
          date: payload.date,
          startTime: payload.startTime,
          description: payload.description,
          accountKey: payload.accountKey,
        })
      : await actions.create(payload)
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

  return { handleEdit, handleDelete, handleAddForDate, handleEditorSave, handleCopyToDay }
}

function resolveEditorDefaults(state: TempoDashboardState, todayKey: string) {
  return {
    defaultDate: state.editorDate || todayKey,
    defaultIssueKey: state.prefillWorklog?.issueKey,
    defaultAccountKey: state.prefillWorklog?.accountKey,
    defaultDescription: state.prefillWorklog?.description,
  }
}

function resolveActiveEditorDate(state: TempoDashboardState, todayKey: string): string {
  return state.editorDate || state.editingWorklog?.date || todayKey
}

function computeDashboardDerived(
  state: TempoDashboardState,
  month: ReturnType<typeof useTempoMonth>,
  today: ReturnType<typeof useTempoToday>,
  todayKey: string
) {
  const activeEditorDate = resolveActiveEditorDate(state, todayKey)
  const isCurrentMonth =
    state.viewMonth.getFullYear() === new Date().getFullYear() &&
    state.viewMonth.getMonth() === new Date().getMonth()
  const activeError = month.error || state.actionError
  const todayHours = today.data?.totalHours || 0
  const editorDefaults = resolveEditorDefaults(state, todayKey)
  return { activeEditorDate, isCurrentMonth, activeError, todayHours, editorDefaults }
}

export function TempoDashboard() {
  const [state, dispatch] = useReducer(
    tempoDashboardReducer,
    undefined,
    createInitialDashboardState
  )
  const todayKey = formatDateKey(new Date())
  const monthLabel = formatMonthLabel(state.viewMonth)

  const { month, today, monthTarget, holidays, refreshAll, actions, capexMap } =
    useTempoDashboardData(state.viewMonth)

  const prevMonth = () => dispatch({ type: 'shiftMonth', delta: -1 })
  const nextMonth = () => dispatch({ type: 'shiftMonth', delta: 1 })
  const goToCurrentMonth = () => dispatch({ type: 'goToCurrentMonth' })

  const { handleEdit, handleDelete, handleAddForDate, handleEditorSave, handleCopyToDay } =
    useTempoDashboardHandlers(state, dispatch, month, holidays, actions, todayKey)

  const { activeEditorDate, isCurrentMonth, activeError, todayHours, editorDefaults } =
    computeDashboardDerived(state, month, today, todayKey)

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
        todayHours={todayHours}
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
          defaultDate={editorDefaults.defaultDate}
          defaultIssueKey={editorDefaults.defaultIssueKey}
          defaultAccountKey={editorDefaults.defaultAccountKey}
          defaultDescription={editorDefaults.defaultDescription}
          existingWorklogs={month.worklogs.filter(w => w.date === activeEditorDate)}
          onSave={handleEditorSave}
          onCancel={() => dispatch({ type: 'closeEditor' })}
        />
      )}
    </div>
  )
}
