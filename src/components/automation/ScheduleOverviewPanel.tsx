import { useState, useEffect, useMemo } from 'react'
import { Calendar, Clock, Play, Pause, ChevronRight } from 'lucide-react'
import { CronExpressionParser } from 'cron-parser'
import { useSchedules } from '../../hooks/useConvex'
import { DAY, formatDateKey, formatTime, MONTH_SHORT } from '../../utils/dateUtils'
import { InlineDropdown, type DropdownOption } from '../InlineDropdown'
import './ScheduleOverviewPanel.css'

interface ScheduleOccurrence {
  scheduleId: string
  scheduleName: string
  jobName: string
  workerType: string
  enabled: boolean
  cron: string
  time: Date
}

interface DayGroup {
  label: string
  dateKey: string
  occurrences: ScheduleOccurrence[]
}

const DAYS_OPTIONS: DropdownOption[] = [
  { value: '1', label: '1 day' },
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
  { value: '5', label: '5 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
]

interface ScheduleOverviewPanelProps {
  onOpenSchedule?: (scheduleId: string) => void
}

interface ForecastConfigState {
  forecastDays: number
  loaded: boolean
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

function normalizeForecastDays(days: number): number {
  return days >= 1 && days <= 30 ? days : 3
}

function buildOccurrence(
  schedule: NonNullable<ReturnType<typeof useSchedules>>[number],
  nextTime: Date
): ScheduleOccurrence {
  return {
    scheduleId: schedule._id,
    scheduleName: schedule.name,
    jobName: schedule.job?.name ?? '(unknown job)',
    workerType: schedule.job?.workerType ?? 'exec',
    enabled: schedule.enabled,
    cron: schedule.cron,
    time: nextTime,
  }
}

function buildOccurrencesForSchedule(
  schedule: NonNullable<ReturnType<typeof useSchedules>>[number],
  now: Date,
  endTime: Date
): ScheduleOccurrence[] {
  if (!schedule.enabled) return []

  try {
    const options: { tz?: string; currentDate?: Date; endDate?: Date } = {
      currentDate: now,
      endDate: endTime,
    }
    if (schedule.timezone) options.tz = schedule.timezone

    const expression = CronExpressionParser.parse(schedule.cron, options)
    const occurrences: ScheduleOccurrence[] = []
    const maxOccurrences = 500

    while (occurrences.length < maxOccurrences) {
      try {
        const next = expression.next()
        const nextTime = next.toDate()
        /* v8 ignore start */
        if (nextTime > endTime) break
        /* v8 ignore stop */
        occurrences.push(buildOccurrence(schedule, nextTime))
      } catch {
        break
      }
    }
    return occurrences
  } catch {
    return []
  }
}

function getDayLabel(occDate: Date, today: Date, tomorrow: Date, originalTime: Date): string {
  if (occDate.getTime() === today.getTime()) return 'Today'
  if (occDate.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return `${DAY_NAMES[originalTime.getDay()]}, ${MONTH_SHORT[originalTime.getMonth()]} ${originalTime.getDate()}`
}

function groupOccurrencesByDay(allOccurrences: ScheduleOccurrence[]): DayGroup[] {
  const sorted = [...allOccurrences].sort((a, b) => a.time.getTime() - b.time.getTime())

  const groups: Map<string, DayGroup> = new Map()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  for (const occ of sorted) {
    const occDate = new Date(occ.time)
    occDate.setHours(0, 0, 0, 0)
    const dateKey = formatDateKey(occDate)

    if (!groups.has(dateKey)) {
      const label = getDayLabel(occDate, today, tomorrow, occ.time)
      groups.set(dateKey, { label, dateKey, occurrences: [] })
    }
    groups.get(dateKey)!.occurrences.push(occ)
  }

  return Array.from(groups.values())
}

function computeDayGroups(
  schedules: ReturnType<typeof useSchedules>,
  forecastDays: number
): DayGroup[] {
  if (!schedules) return []

  const now = new Date()
  const endTime = new Date(now.getTime() + forecastDays * DAY)
  const allOccurrences = schedules.flatMap(schedule =>
    buildOccurrencesForSchedule(schedule, now, endTime)
  )

  return groupOccurrencesByDay(allOccurrences)
}

const WORKER_BADGE_CLASSES: Record<string, string> = {
  exec: 'worker-badge-exec',
  ai: 'worker-badge-ai',
  skill: 'worker-badge-skill',
}

function getWorkerBadgeClass(workerType: string): string {
  return Object.hasOwn(WORKER_BADGE_CLASSES, workerType) ? WORKER_BADGE_CLASSES[workerType] : ''
}

function ScheduleOverviewSummary({
  enabledCount,
  disabledCount,
  totalOccurrences,
  forecastDays,
}: {
  enabledCount: number
  disabledCount: number
  totalOccurrences: number
  forecastDays: number
}) {
  return (
    <div className="schedule-overview-summary">
      <span className="summary-stat">
        <span className="summary-number">{enabledCount}</span> active schedule
        {enabledCount !== 1 ? 's' : ''}
      </span>
      {disabledCount > 0 && (
        <span className="summary-stat summary-muted">
          <Pause size={12} />
          {disabledCount} paused
        </span>
      )}
      <span className="summary-stat">
        <Play size={12} />
        {totalOccurrences} run{totalOccurrences !== 1 ? 's' : ''} in next {forecastDays} day
        {forecastDays !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

function ScheduleEmptyState({
  forecastDays,
  totalSchedules,
  enabledCount,
}: {
  forecastDays: number
  totalSchedules: number
  enabledCount: number
}) {
  return (
    <div className="schedule-overview-empty">
      <Calendar size={32} strokeWidth={1.5} />
      <p>
        {/* v8 ignore start */}
        No scheduled runs in the next {forecastDays} day{forecastDays !== 1 ? 's' : ''}.
        {/* v8 ignore stop */}
      </p>
      {totalSchedules === 0 && <p className="empty-hint">Create a schedule to get started.</p>}
      {totalSchedules > 0 && enabledCount === 0 && (
        <p className="empty-hint">All schedules are currently paused.</p>
      )}
    </div>
  )
}

function getScheduleCounts(schedules: ReturnType<typeof useSchedules>) {
  const enabledCount = schedules?.filter(s => s.enabled).length ?? 0
  const disabledCount = (schedules?.length ?? 0) - enabledCount
  return { enabledCount, disabledCount }
}

export function ScheduleOverviewPanel({ onOpenSchedule }: ScheduleOverviewPanelProps) {
  const schedules = useSchedules()
  const [configState, setConfigState] = useState<ForecastConfigState>({
    forecastDays: 3,
    loaded: false,
  })
  const { forecastDays, loaded: loadedConfig } = configState

  // Load config from electron-store
  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-schedule-forecast-days')
      .then((days: number) =>
        setConfigState({
          forecastDays: normalizeForecastDays(days),
          loaded: true,
        })
      )
      .catch(() =>
        setConfigState(currentState => ({
          ...currentState,
          loaded: true,
        }))
      )
  }, [])

  // Save config when changed
  const handleDaysChange = (value: string) => {
    const days = normalizeForecastDays(parseInt(value, 10))
    setConfigState(currentState => ({
      ...currentState,
      forecastDays: days,
    }))
    window.ipcRenderer.invoke('config:set-schedule-forecast-days', days).catch(() => {})
  }

  // Compute upcoming occurrences
  const dayGroups = useMemo(
    () => computeDayGroups(schedules, forecastDays),
    [schedules, forecastDays]
  )

  const totalOccurrences = dayGroups.reduce((sum, g) => sum + g.occurrences.length, 0)
  const { enabledCount, disabledCount } = getScheduleCounts(schedules)

  if (schedules === undefined || !loadedConfig) {
    return (
      <div className="schedule-overview">
        <div className="schedule-overview-loading">
          <div className="loading-spinner" />
          <span>Loading schedule forecast...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="schedule-overview">
      <div className="schedule-overview-header">
        <div className="schedule-overview-title">
          <Calendar size={18} />
          <h2>Upcoming Scheduled Jobs</h2>
        </div>
        <div className="schedule-overview-controls">
          <span className="schedule-overview-label">Forecast:</span>
          <InlineDropdown
            value={String(forecastDays)}
            options={DAYS_OPTIONS}
            onChange={handleDaysChange}
            icon={<Clock size={12} />}
            className="schedule-forecast-dropdown"
          />
        </div>
      </div>

      <ScheduleOverviewSummary
        enabledCount={enabledCount}
        disabledCount={disabledCount}
        totalOccurrences={totalOccurrences}
        forecastDays={forecastDays}
      />

      <div className="schedule-overview-timeline">
        {dayGroups.length === 0 ? (
          <ScheduleEmptyState
            forecastDays={forecastDays}
            totalSchedules={schedules.length}
            enabledCount={enabledCount}
          />
        ) : (
          dayGroups.map(group => (
            <div key={group.dateKey} className="day-group">
              <div className="day-group-header">
                <span className="day-group-label">{group.label}</span>
                <span className="day-group-count">
                  {group.occurrences.length} run{group.occurrences.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="day-group-items">
                {group.occurrences.map(occ => (
                  <button
                    key={`${occ.scheduleId}-${occ.time.getTime()}`}
                    type="button"
                    className="occurrence-row"
                    onClick={() => onOpenSchedule?.(occ.scheduleId)}
                    title={`Schedule: ${occ.scheduleName}\nJob: ${occ.jobName}\nCron: ${occ.cron}`}
                  >
                    <span className="occurrence-time">{formatTime(occ.time)}</span>
                    <span className="occurrence-timeline-dot" />
                    <span className="occurrence-info">
                      <span className="occurrence-schedule-name">{occ.scheduleName}</span>
                      <ChevronRight size={10} className="occurrence-arrow" />
                      <span className="occurrence-job-name">{occ.jobName}</span>
                    </span>
                    <span
                      className={`occurrence-worker-badge ${getWorkerBadgeClass(occ.workerType)}`}
                    >
                      {occ.workerType}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
