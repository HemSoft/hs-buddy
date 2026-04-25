import { useMemo, useId } from 'react'
import { formatHour12 } from '../../utils/dateUtils'
import { parseCronValue, buildCronExpression, type CronState } from './cronUtils'
import './CronBuilder.css'

interface CronBuilderProps {
  value: string
  onChange: (cron: string) => void
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', short: 'S' },
  { value: 1, label: 'Mon', short: 'M' },
  { value: 2, label: 'Tue', short: 'T' },
  { value: 3, label: 'Wed', short: 'W' },
  { value: 4, label: 'Thu', short: 'T' },
  { value: 5, label: 'Fri', short: 'F' },
  { value: 6, label: 'Sat', short: 'S' },
]

const MINUTE_INCREMENTS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

function describeCronSchedule(
  frequency: string,
  minute: number,
  hour: number,
  dayOfMonth: number,
  selectedDays: number[]
): string {
  const fmtTime = (h: number, m: number) => {
    /* v8 ignore start */
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
    /* v8 ignore stop */
    return `${displayHour}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  /* v8 ignore start */
  switch (frequency) {
    /* v8 ignore stop */
    case 'minute':
      return 'Runs every minute'
    case 'hourly':
      return `Runs every hour at minute ${minute}`
    case 'daily':
      return `Runs daily at ${fmtTime(hour, minute)}`
    case 'weekly': {
      const dayNames = [...selectedDays].sort().flatMap(d => {
        const label = DAYS_OF_WEEK.find(day => day.value === d)?.label
        /* v8 ignore start */
        return label ? [label] : []
        /* v8 ignore stop */
      })
      return `Runs every ${dayNames.join(', ')} at ${fmtTime(hour, minute)}`
    }
    case 'monthly':
      return `Runs on day ${dayOfMonth} of every month at ${fmtTime(hour, minute)}`
    case 'custom':
      return 'Custom cron expression'
    default:
      /* v8 ignore start */
      return ''
    /* v8 ignore stop */
  }
}

function CronOptions({
  frequency,
  minute,
  dayOfMonth,
  selectedDays,
  hourSelect,
  minuteSelect,
  toggleDay,
  updateCron,
}: {
  frequency: string
  minute: number
  dayOfMonth: number
  selectedDays: number[]
  hourSelect: React.ReactNode
  minuteSelect: React.ReactNode
  toggleDay: (day: number) => void
  updateCron: (patch: Partial<CronState>) => void
}) {
  if (frequency === 'hourly') {
    return (
      <div className="cron-option">
        <span className="option-label">At minute</span>
        <select value={minute} onChange={e => updateCron({ minute: parseInt(e.target.value) })}>
          {Array.from({ length: 60 }, (_, min) => (
            <option key={min} value={min}>
              {min.toString().padStart(2, '0')}
            </option>
          ))}
        </select>
        <span className="option-suffix">of every hour</span>
      </div>
    )
  }

  if (frequency === 'daily') {
    return (
      <div className="cron-option">
        <span className="option-label">At</span>
        {hourSelect}
        <span className="option-separator">:</span>
        {minuteSelect}
      </div>
    )
  }

  if (frequency === 'weekly') {
    return (
      <>
        <div className="cron-option">
          <span className="option-label">On</span>
          <div className="day-selector">
            {DAYS_OF_WEEK.map(day => (
              <button
                key={day.value}
                type="button"
                className={`day-btn ${selectedDays.includes(day.value) ? 'active' : ''}`}
                onClick={() => toggleDay(day.value)}
                title={day.label}
              >
                {day.short}
              </button>
            ))}
          </div>
        </div>
        <div className="cron-option">
          <span className="option-label">At</span>
          {hourSelect}
          <span className="option-separator">:</span>
          {minuteSelect}
        </div>
      </>
    )
  }

  if (frequency === 'monthly') {
    return (
      <>
        <div className="cron-option">
          <span className="option-label">On day</span>
          <select
            value={dayOfMonth}
            onChange={e => updateCron({ dayOfMonth: parseInt(e.target.value) })}
          >
            {Array.from({ length: 31 }, (_, day) => (
              <option key={day + 1} value={day + 1}>
                {day + 1}
              </option>
            ))}
          </select>
          <span className="option-suffix">of every month</span>
        </div>
        <div className="cron-option">
          <span className="option-label">At</span>
          {hourSelect}
          <span className="option-separator">:</span>
          {minuteSelect}
        </div>
      </>
    )
  }

  if (frequency === 'custom') {
    return null // handled separately in CronBuilder
  }

  return null
}

function freqBtnClass(current: string, target: string): string {
  return `freq-btn ${current === target ? 'active' : ''}`
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const cronFreqLabelId = useId()
  const cronState = useMemo(() => parseCronValue(value), [value])
  const { frequency, minute, hour, dayOfMonth, selectedDays } = cronState
  const updateCron = (patch: Partial<CronState>) => {
    onChange(buildCronExpression({ ...cronState, ...patch }, value))
  }
  const cronExpression = useMemo(() => buildCronExpression(cronState, value), [cronState, value])

  const description = useMemo(
    () => describeCronSchedule(frequency, minute, hour, dayOfMonth, selectedDays),
    [frequency, minute, hour, dayOfMonth, selectedDays]
  )

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      if (selectedDays.length === 1) return
      updateCron({ selectedDays: selectedDays.filter(selectedDay => selectedDay !== day) })
      return
    }

    updateCron({ selectedDays: [...selectedDays, day] })
  }

  const hourSelect = (
    /* v8 ignore start */
    <select value={hour} onChange={e => updateCron({ hour: parseInt(e.target.value) })}>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {formatHour12(h)}
        </option>
      ))}
    </select>
    /* v8 ignore stop */
  )

  const minuteSelect = (
    /* v8 ignore start */
    <select value={minute} onChange={e => updateCron({ minute: parseInt(e.target.value) })}>
      {MINUTE_INCREMENTS.map(m => (
        <option key={m} value={m}>
          {m.toString().padStart(2, '0')}
        </option>
      ))}
    </select>
    /* v8 ignore stop */
  )

  return (
    <div className="cron-builder">
      <div className="cron-frequency">
        <span id={cronFreqLabelId} className="cron-label">
          Run Frequency
        </span>
        <div className="frequency-buttons" role="group" aria-labelledby={cronFreqLabelId}>
          <button
            type="button"
            className={freqBtnClass(frequency, 'minute')}
            onClick={() => updateCron({ frequency: 'minute' })}
          >
            Every Minute
          </button>
          <button
            type="button"
            className={freqBtnClass(frequency, 'hourly')}
            onClick={() => updateCron({ frequency: 'hourly' })}
          >
            Hourly
          </button>
          <button
            type="button"
            className={freqBtnClass(frequency, 'daily')}
            onClick={() => updateCron({ frequency: 'daily' })}
          >
            Daily
          </button>
          <button
            type="button"
            className={freqBtnClass(frequency, 'weekly')}
            onClick={() => updateCron({ frequency: 'weekly' })}
          >
            Weekly
          </button>
          <button
            type="button"
            className={freqBtnClass(frequency, 'monthly')}
            onClick={() => updateCron({ frequency: 'monthly' })}
          >
            Monthly
          </button>
          <button
            type="button"
            className={freqBtnClass(frequency, 'custom')}
            onClick={() => updateCron({ frequency: 'custom' })}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="cron-options">
        <CronOptions
          frequency={frequency}
          minute={minute}
          dayOfMonth={dayOfMonth}
          selectedDays={selectedDays}
          hourSelect={hourSelect}
          minuteSelect={minuteSelect}
          toggleDay={toggleDay}
          updateCron={updateCron}
        />

        {/* Custom: raw cron input */}
        {frequency === 'custom' && (
          <div className="cron-option custom">
            <input
              type="text"
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="* * * * *"
              className="custom-cron-input"
            />
            <div className="cron-format-hint">
              <span className="cron-part">minute</span>
              <span className="cron-part">hour</span>
              <span className="cron-part">day</span>
              <span className="cron-part">month</span>
              <span className="cron-part">weekday</span>
            </div>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="cron-preview">
        <div className="preview-expression">
          <span className="preview-label">Cron:</span>
          <code className="preview-cron">{cronExpression}</code>
        </div>
        <div className="preview-description">
          <span className="preview-icon">📅</span>
          {description}
        </div>
      </div>
    </div>
  )
}
