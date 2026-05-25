import { useCallback, useMemo, useReducer, useRef } from 'react'
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
import type {
  TempoWorklog,
  TempoIssueSummary,
  CreateWorklogPayload,
  TempoScheduleDay,
} from '../../types/tempo'
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
  templateIssues: TempoIssueSummary[]
  templatePrefills: Record<string, TempoWorklog>
  loadingTemplates: boolean
}

type TempoDashboardAction =
  | { type: 'setViewMode'; viewMode: ViewMode }
  | { type: 'openCreate'; date: string; prefillWorklog: TempoWorklog | null }
  | { type: 'openEdit'; worklog: TempoWorklog }
  | { type: 'closeEditor' }
  | { type: 'setActionError'; error: string | null }
  | { type: 'shiftMonth'; delta: number }
  | { type: 'goToCurrentMonth' }
  | {
      type: 'setTemplateIssues'
      issues: TempoIssueSummary[]
      prefills: Record<string, TempoWorklog>
    }
  | { type: 'setLoadingTemplates'; loading: boolean }

const TEMPO_VIEW_KEY = 'viewMode:tempo'

function createInitialDashboardState(): TempoDashboardState {
  let savedMode: ViewMode = 'grid'
  try {
    const stored = localStorage.getItem(TEMPO_VIEW_KEY)
    if (stored === 'grid' || stored === 'timeline') savedMode = stored
  } catch (_: unknown) {
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
    templateIssues: [],
    templatePrefills: {},
    loadingTemplates: false,
  }
}

function persistViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(TEMPO_VIEW_KEY, mode)
  } catch (_: unknown) {
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
    templateIssues: [],
    templatePrefills: {},
    loadingTemplates: false,
  }),
  goToCurrentMonth: s => ({
    ...s,
    viewMonth: new Date(),
    templateIssues: [],
    templatePrefills: {},
    loadingTemplates: false,
  }),
  setTemplateIssues: (s, a) => {
    const act = a as Extract<TempoDashboardAction, { type: 'setTemplateIssues' }>
    return {
      ...s,
      templateIssues: act.issues,
      templatePrefills: act.prefills,
      loadingTemplates: false,
    }
  },
  setLoadingTemplates: (s, a) => ({
    ...s,
    loadingTemplates: (a as Extract<TempoDashboardAction, { type: 'setLoadingTemplates' }>).loading,
  }),
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
  actions: ReturnType<typeof useTempoActions>,
  today: ReturnType<typeof useTempoToday>,
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
    const prefill = issueKey
      ? (findPrefillWorklog(month.worklogs, issueKey) ?? state.templatePrefills[issueKey] ?? null)
      : null
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

  const handleCopyToDay = async (sourceWorklogs: TempoWorklog[]) => {
    dispatch({ type: 'setActionError', error: null })
    const targetDate = todayKey
    // today.data null means service unavailable; empty worklogs is intentional
    const targetWorklogs = today.data?.worklogs ?? month.worklogs.filter(w => w.date === targetDate)
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

function shouldReplaceTemplateWorklog(
  existing: { summary: string; latestWorklog: TempoWorklog } | undefined,
  worklog: TempoWorklog
): boolean {
  if (!existing) return true
  if (worklog.date > existing.latestWorklog.date) return true
  return (
    worklog.date === existing.latestWorklog.date &&
    worklog.startTime > existing.latestWorklog.startTime
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for testing
export function buildTemplateFromWorklogs(worklogs: TempoWorklog[]): {
  issues: TempoIssueSummary[]
  prefills: Record<string, TempoWorklog>
} {
  const seen = new Map<string, { summary: string; latestWorklog: TempoWorklog }>()
  for (const worklog of worklogs) {
    const existing = seen.get(worklog.issueKey)
    if (shouldReplaceTemplateWorklog(existing, worklog)) {
      seen.set(worklog.issueKey, { summary: worklog.issueSummary, latestWorklog: worklog })
    }
  }

  const issues: TempoIssueSummary[] = []
  const prefills: Record<string, TempoWorklog> = {}
  for (const [issueKey, { summary, latestWorklog }] of seen) {
    issues.push({ issueKey, issueSummary: summary, totalHours: 0, hoursByDate: {} })
    prefills[issueKey] = latestWorklog
  }
  return { issues, prefills }
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

interface PreviousMonthTemplateResult {
  success: boolean
  data?: { worklogs: TempoWorklog[] }
  error?: string
}

function getPreviousMonthWorklogs(result: PreviousMonthTemplateResult): TempoWorklog[] {
  if (!result.success || !result.data) return []
  return result.data.worklogs
}

function getPreviousMonthTemplateError(result: PreviousMonthTemplateResult): string {
  return result.error || 'Failed to load previous month data.'
}

function applyPreviousMonthTemplateResult(
  result: PreviousMonthTemplateResult,
  dispatch: React.Dispatch<TempoDashboardAction>
): void {
  const worklogs = getPreviousMonthWorklogs(result)
  if (worklogs.length > 0) {
    const { issues, prefills } = buildTemplateFromWorklogs(worklogs)
    dispatch({ type: 'setTemplateIssues', issues, prefills })
    return
  }
  if (result.success) {
    dispatch({ type: 'setLoadingTemplates', loading: false })
    dispatch({
      type: 'setActionError',
      error: 'No entries found in the previous month.',
    })
    return
  }
  dispatch({ type: 'setLoadingTemplates', loading: false })
  dispatch({
    type: 'setActionError',
    error: getPreviousMonthTemplateError(result),
  })
}

export function TempoDashboard() {
  const [state, dispatch] = useReducer(
    tempoDashboardReducer,
    undefined,
    createInitialDashboardState
  )
  const todayKey = formatDateKey(new Date())
  const monthLabel = formatMonthLabel(state.viewMonth)
  const copyMonthRef = useRef('')

  const { month, today, monthTarget, holidays, refreshAll, actions, capexMap } =
    useTempoDashboardData(state.viewMonth)

  const prevMonth = () => dispatch({ type: 'shiftMonth', delta: -1 })
  const nextMonth = () => dispatch({ type: 'shiftMonth', delta: 1 })
  const goToCurrentMonth = () => dispatch({ type: 'goToCurrentMonth' })

  const { handleEdit, handleDelete, handleAddForDate, handleEditorSave, handleCopyToDay } =
    useTempoDashboardHandlers(state, dispatch, month, actions, today, todayKey)
  const { activeEditorDate, isCurrentMonth, activeError, todayHours, editorDefaults } =
    computeDashboardDerived(state, month, today, todayKey)

  const handleCopyFromPreviousMonth = useCallback(async () => {
    const y = state.viewMonth.getFullYear()
    const m = state.viewMonth.getMonth()
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`
    copyMonthRef.current = monthKey
    dispatch({ type: 'setLoadingTemplates', loading: true })
    const { from, to } = getMonthRange(new Date(y, m - 1, 1))
    const result = await window.tempo.getWeek(from, to)
    if (copyMonthRef.current !== monthKey) return
    applyPreviousMonthTemplateResult(result, dispatch)
  }, [state.viewMonth])

  const mergedIssueSummaries = useMemo(() => {
    if (state.templateIssues.length === 0) return month.issueSummaries
    const realKeys = new Set(month.issueSummaries.map(s => s.issueKey))
    return [...month.issueSummaries, ...state.templateIssues.filter(t => !realKeys.has(t.issueKey))]
  }, [month.issueSummaries, state.templateIssues])

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
          issueSummaries={mergedIssueSummaries}
          worklogs={month.worklogs}
          totalHours={month.totalHours}
          monthDate={state.viewMonth}
          holidays={holidays}
          loading={month.loading}
          loadingTemplates={state.loadingTemplates}
          capexMap={capexMap}
          onCellClick={handleAddForDate}
          onWorklogEdit={handleEdit}
          onWorklogDelete={handleDelete}
          onCopyToToday={handleCopyToDay}
          onCopyFromPreviousMonth={handleCopyFromPreviousMonth}
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
