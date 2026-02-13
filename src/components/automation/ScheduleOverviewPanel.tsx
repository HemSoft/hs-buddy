import { useState, useEffect, useMemo } from 'react'
import { Calendar, Clock, Play, Pause, ChevronRight } from 'lucide-react'
import { CronExpressionParser } from 'cron-parser'
import { useSchedules } from '../../hooks/useConvex'
import { InlineDropdown } from '../InlineDropdown'
import type { DropdownOption } from '../InlineDropdown'
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

export function ScheduleOverviewPanel({ onOpenSchedule }: ScheduleOverviewPanelProps) {
  const schedules = useSchedules()
  const [forecastDays, setForecastDays] = useState(3)
  const [loadedConfig, setLoadedConfig] = useState(false)

  // Load config from electron-store
  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-schedule-forecast-days')
      .then((days: number) => {
        if (days && days >= 1 && days <= 30) {
          setForecastDays(days)
        }
        setLoadedConfig(true)
      })
      .catch(() => setLoadedConfig(true))
  }, [])

  // Save config when changed
  const handleDaysChange = (value: string) => {
    const days = parseInt(value, 10)
    setForecastDays(days)
    window.ipcRenderer.invoke('config:set-schedule-forecast-days', days).catch(() => {})
  }

  // Compute upcoming occurrences
  const dayGroups = useMemo<DayGroup[]>(() => {
    if (!schedules) return []

    const now = new Date()
    const endTime = new Date(now.getTime() + forecastDays * 24 * 60 * 60 * 1000)
    const allOccurrences: ScheduleOccurrence[] = []

    for (const schedule of schedules) {
      if (!schedule.enabled) continue

      try {
        const options: { tz?: string; currentDate?: Date; endDate?: Date } = {}
        if (schedule.timezone) options.tz = schedule.timezone
        options.currentDate = now
        options.endDate = endTime

        const expression = CronExpressionParser.parse(schedule.cron, options)

        // Enumerate occurrences within the window
        let count = 0
        const maxOccurrences = 500 // safety limit per schedule
        while (count < maxOccurrences) {
          try {
            const next = expression.next()
            const nextTime = next.toDate()
            if (nextTime > endTime) break
            allOccurrences.push({
              scheduleId: schedule._id,
              scheduleName: schedule.name,
              jobName: schedule.job?.name ?? '(unknown job)',
              workerType: schedule.job?.workerType ?? 'exec',
              enabled: schedule.enabled,
              cron: schedule.cron,
              time: nextTime,
            })
            count++
          } catch {
            break // No more occurrences
          }
        }
      } catch {
        // Invalid cron — skip
      }
    }

    // Sort by time
    allOccurrences.sort((a, b) => a.time.getTime() - b.time.getTime())

    // Group by day
    const groups: Map<string, DayGroup> = new Map()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    for (const occ of allOccurrences) {
      const occDate = new Date(occ.time)
      occDate.setHours(0, 0, 0, 0)
      const dateKey = occDate.toISOString().slice(0, 10)

      if (!groups.has(dateKey)) {
        let label: string
        if (occDate.getTime() === today.getTime()) {
          label = 'Today'
        } else if (occDate.getTime() === tomorrow.getTime()) {
          label = 'Tomorrow'
        } else {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          label = `${dayNames[occ.time.getDay()]}, ${monthNames[occ.time.getMonth()]} ${occ.time.getDate()}`
        }
        groups.set(dateKey, { label, dateKey, occurrences: [] })
      }
      groups.get(dateKey)!.occurrences.push(occ)
    }

    return Array.from(groups.values())
  }, [schedules, forecastDays])

  const totalOccurrences = dayGroups.reduce((sum, g) => sum + g.occurrences.length, 0)
  const enabledCount = schedules?.filter(s => s.enabled).length ?? 0
  const disabledCount = (schedules?.length ?? 0) - enabledCount

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

  const getWorkerBadgeClass = (workerType: string) => {
    switch (workerType) {
      case 'exec': return 'worker-badge-exec'
      case 'ai': return 'worker-badge-ai'
      case 'skill': return 'worker-badge-skill'
      default: return ''
    }
  }

  const formatTime = (date: Date) => {
    const h = date.getHours()
    const m = date.getMinutes()
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
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

      <div className="schedule-overview-summary">
        <span className="summary-stat">
          <span className="summary-number">{enabledCount}</span> active schedule{enabledCount !== 1 ? 's' : ''}
        </span>
        {disabledCount > 0 && (
          <span className="summary-stat summary-muted">
            <Pause size={12} />
            {disabledCount} paused
          </span>
        )}
        <span className="summary-stat">
          <Play size={12} />
          {totalOccurrences} run{totalOccurrences !== 1 ? 's' : ''} in next {forecastDays} day{forecastDays !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="schedule-overview-timeline">
        {dayGroups.length === 0 ? (
          <div className="schedule-overview-empty">
            <Calendar size={32} strokeWidth={1.5} />
            <p>No scheduled runs in the next {forecastDays} day{forecastDays !== 1 ? 's' : ''}.</p>
            {schedules.length === 0 && <p className="empty-hint">Create a schedule to get started.</p>}
            {schedules.length > 0 && enabledCount === 0 && (
              <p className="empty-hint">All schedules are currently paused.</p>
            )}
          </div>
        ) : (
          dayGroups.map(group => (
            <div key={group.dateKey} className="day-group">
              <div className="day-group-header">
                <span className="day-group-label">{group.label}</span>
                <span className="day-group-count">{group.occurrences.length} run{group.occurrences.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="day-group-items">
                {group.occurrences.map((occ, i) => (
                  <div
                    key={`${occ.scheduleId}-${i}`}
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
                    <span className={`occurrence-worker-badge ${getWorkerBadgeClass(occ.workerType)}`}>
                      {occ.workerType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
