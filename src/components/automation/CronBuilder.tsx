import { useState, useEffect, useMemo, useId } from 'react'
import { formatHour12 } from '../../utils/dateUtils'
import './CronBuilder.css'

type Frequency = 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

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

interface CronState {
  frequency: Frequency
  minute: number
  hour: number
  dayOfMonth: number
  selectedDays: number[]
}

type CronSignature = 'v***' | 'vv**' | 'vv*v' | 'vvv*'

const CRON_SIGNATURE_RESOLVERS: Record<
  CronSignature,
  (min: string, hr: string, dom: string, dow: string) => Partial<CronState>
> = {
  'v***': min => ({ frequency: 'hourly', minute: parseInt(min) || 0 }),
  'vv**': (min, hr) => ({ frequency: 'daily', minute: parseInt(min) || 0, hour: parseInt(hr) || 9 }),
  'vv*v': (min, hr, _dom, dow) => {
    const days = dow
      .split(',')
      .map(day => parseInt(day))
      .filter(day => !isNaN(day))
    return {
      frequency: 'weekly',
      minute: parseInt(min) || 0,
      hour: parseInt(hr) || 9,
      selectedDays: days.length > 0 ? days : [1],
    }
  },
  'vvv*': (min, hr, dom) => ({
    frequency: 'monthly',
    minute: parseInt(min) || 0,
    hour: parseInt(hr) || 9,
    dayOfMonth: parseInt(dom) || 1,
  }),
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const cronFreqLabelId = useId()
  const [cronState, setCronState] = useState<CronState>({
    frequency: 'hourly',
    minute: 0,
    hour: 9,
    dayOfMonth: 1,
    selectedDays: [1],
  })
  const { frequency, minute, hour, dayOfMonth, selectedDays } = cronState
  const updateCron = (patch: Partial<CronState>) => setCronState(prev => ({ ...prev, ...patch }))

  // Parse incoming cron value to set initial state
  useEffect(() => {
    const parts = value.split(' ')
    if (parts.length !== 5) {
      setCronState(prev => ({ ...prev, frequency: 'custom' }))
      return
    }

    const [min, hr, dom, , dow] = parts

    if (value === '* * * * *') {
      setCronState(prev => ({ ...prev, frequency: 'minute' }))
      return
    }

    const signature = [min, hr, dom, dow].map(part => (part === '*' ? '*' : 'v')).join('')
    const resolver = CRON_SIGNATURE_RESOLVERS[signature as CronSignature]

    if (!resolver) {
      setCronState(prev => ({ ...prev, frequency: 'custom' }))
      return
    }

    setCronState(prev => ({
      ...prev,
      ...resolver(min, hr, dom, dow),
    }))
  }, [value])

  // Generate cron expression when settings change
  const cronExpression = useMemo(() => {
    switch (frequency) {
      case 'minute':
        return '* * * * *'
      case 'hourly':
        return `${minute} * * * *`
      case 'daily':
        return `${minute} ${hour} * * *`
      case 'weekly':
        return `${minute} ${hour} * * ${selectedDays.sort().join(',')}`
      case 'monthly':
        return `${minute} ${hour} ${dayOfMonth} * *`
      case 'custom':
        return value
      default:
        return '0 * * * *'
    }
  }, [frequency, minute, hour, dayOfMonth, selectedDays, value])

  // Update parent when cron changes
  useEffect(() => {
    onChange(cronExpression)
  }, [cronExpression, onChange])

  // Human-readable description
  const description = useMemo(() => {
    const fmtTime = (h: number, m: number) => {
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
      return `${displayHour}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
    }

    switch (frequency) {
      case 'minute':
        return 'Runs every minute'
      case 'hourly':
        return `Runs every hour at minute ${minute}`
      case 'daily':
        return `Runs daily at ${fmtTime(hour, minute)}`
      case 'weekly': {
        const dayNames = selectedDays
          .sort()
          .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label)
          .filter(Boolean)
        return `Runs every ${dayNames.join(', ')} at ${fmtTime(hour, minute)}`
      }
      case 'monthly':
        return `Runs on day ${dayOfMonth} of every month at ${fmtTime(hour, minute)}`
      case 'custom':
        return 'Custom cron expression'
      default:
        return ''
    }
  }, [frequency, minute, hour, dayOfMonth, selectedDays])

  const toggleDay = (day: number) => {
    setCronState(prev => {
      const prevDays = prev.selectedDays
      if (prevDays.includes(day)) {
        // Don't allow deselecting all days
        if (prevDays.length === 1) return prev
        return { ...prev, selectedDays: prevDays.filter(d => d !== day) }
      }
      return { ...prev, selectedDays: [...prevDays, day] }
    })
  }

  return (
    <div className="cron-builder">
      <div className="cron-frequency">
        <span id={cronFreqLabelId} className="cron-label">Run Frequency</span>
        <div className="frequency-buttons" role="group" aria-labelledby={cronFreqLabelId}>
          <button
            type="button"
            className={`freq-btn ${frequency === 'minute' ? 'active' : ''}`}
            onClick={() => updateCron({ frequency: 'minute' })}
          >
            Every Minute
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'hourly' ? 'active' : ''}`}
            onClick={() => updateCron({ frequency: 'hourly' })}
          >
            Hourly
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'daily' ? 'active' : ''}`}
            onClick={() => updateCron({ frequency: 'daily' })}
          >
            Daily
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'weekly' ? 'active' : ''}`}
            onClick={() => updateCron({ frequency: 'weekly' })}
          >
            Weekly
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'monthly' ? 'active' : ''}`}
            onClick={() => updateCron({ frequency: 'monthly' })}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`freq-btn ${frequency === 'custom' ? 'active' : ''}`}
            onClick={() => updateCron({ frequency: 'custom' })}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="cron-options">
        {/* Hourly: minute selector */}
        {frequency === 'hourly' && (
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
        )}

        {/* Daily: time picker */}
        {frequency === 'daily' && (
          <div className="cron-option">
            <span className="option-label">At</span>
            <select value={hour} onChange={e => updateCron({ hour: parseInt(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {formatHour12(h)}
                </option>
              ))}
            </select>
            <span className="option-separator">:</span>
            <select value={minute} onChange={e => updateCron({ minute: parseInt(e.target.value) })}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                <option key={m} value={m}>
                  {m.toString().padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Weekly: day selector + time picker */}
        {frequency === 'weekly' && (
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
              <select value={hour} onChange={e => updateCron({ hour: parseInt(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {formatHour12(h)}
                  </option>
                ))}
              </select>
              <span className="option-separator">:</span>
              <select value={minute} onChange={e => updateCron({ minute: parseInt(e.target.value) })}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Monthly: day of month + time picker */}
        {frequency === 'monthly' && (
          <>
            <div className="cron-option">
              <span className="option-label">On day</span>
              <select value={dayOfMonth} onChange={e => updateCron({ dayOfMonth: parseInt(e.target.value) })}>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <span className="option-suffix">of every month</span>
            </div>
            <div className="cron-option">
              <span className="option-label">At</span>
              <select value={hour} onChange={e => updateCron({ hour: parseInt(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {formatHour12(h)}
                  </option>
                ))}
              </select>
              <span className="option-separator">:</span>
              <select value={minute} onChange={e => updateCron({ minute: parseInt(e.target.value) })}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

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
