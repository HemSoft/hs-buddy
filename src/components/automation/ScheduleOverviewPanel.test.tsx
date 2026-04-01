import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { ScheduleOverviewPanel } from './ScheduleOverviewPanel'

const mockInvoke = vi.fn()

let mockSchedules:
  | Array<{
      _id: string
      name: string
      enabled: boolean
      cron: string
      timezone?: string
      job?: { name: string; workerType: string } | null
    }>
  | undefined

vi.mock('../../hooks/useConvex', () => ({
  useSchedules: () => mockSchedules,
}))

vi.mock('../InlineDropdown', () => ({
  InlineDropdown: ({
    value,
    options,
    onChange,
  }: {
    value: string
    options: Array<{ value: string; label: string }>
    onChange: (value: string) => void
  }) => (
    <label htmlFor="forecast-days">
      Forecast
      <select
        id="forecast-days"
        data-testid="forecast-dropdown"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}))

describe('ScheduleOverviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T10:00:00Z'))
    mockSchedules = undefined
    mockInvoke.mockImplementation((channel: string, value?: number) => {
      if (channel === 'config:get-schedule-forecast-days') {
        return Promise.resolve(3)
      }
      if (channel === 'config:set-schedule-forecast-days') {
        return Promise.resolve(value)
      }
      return Promise.resolve(undefined)
    })
    Object.defineProperty(window, 'ipcRenderer', {
      value: { invoke: mockInvoke },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a loading state before schedules and config are ready', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}))
    render(<ScheduleOverviewPanel />)

    expect(screen.getByText('Loading schedule forecast...')).toBeInTheDocument()
  })

  it('renders the empty state when there are no schedules', async () => {
    mockSchedules = []
    render(<ScheduleOverviewPanel />)
    await act(async () => {})

    expect(screen.getByText('No scheduled runs in the next 3 days.')).toBeInTheDocument()
    expect(screen.getByText('Create a schedule to get started.')).toBeInTheDocument()
  })

  it('renders a paused-state empty hint when all schedules are disabled', async () => {
    mockSchedules = [
      {
        _id: 'sched-1',
        name: 'Paused Schedule',
        enabled: false,
        cron: '0 11 * * *',
        job: { name: 'Paused Job', workerType: 'exec' },
      },
    ]

    render(<ScheduleOverviewPanel />)
    await act(async () => {})

    expect(screen.getByText('All schedules are currently paused.')).toBeInTheDocument()
    expect(screen.getByText('1 paused')).toBeInTheDocument()
  })

  it('groups upcoming runs, skips invalid schedules, persists forecast changes, and opens a schedule', async () => {
    const onOpenSchedule = vi.fn()
    mockSchedules = [
      {
        _id: 'sched-today',
        name: 'Morning Review',
        enabled: true,
        cron: '0 11 * * *',
        job: { name: 'Review Queue', workerType: 'ai' },
      },
      {
        _id: 'sched-tomorrow',
        name: 'Tomorrow Cleanup',
        enabled: true,
        cron: '30 8 * * *',
        job: { name: 'Cleanup', workerType: 'exec' },
      },
      {
        _id: 'sched-invalid',
        name: 'Broken Schedule',
        enabled: true,
        cron: 'not a cron',
        job: { name: 'Broken Job', workerType: 'skill' },
      },
    ]

    render(<ScheduleOverviewPanel onOpenSchedule={onOpenSchedule} />)
    await act(async () => {})

    expect(screen.getByRole('heading', { name: 'Upcoming Scheduled Jobs' })).toBeInTheDocument()
    expect(
      screen.getByText((_, node) => node?.textContent === '3 active schedules')
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, node) => node?.textContent === '6 runs in next 3 days')
    ).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getAllByText('Morning Review').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tomorrow Cleanup').length).toBeGreaterThan(0)
    expect(screen.queryByText('Broken Schedule')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('forecast-dropdown'), { target: { value: '1' } })
    expect(mockInvoke).toHaveBeenCalledWith('config:set-schedule-forecast-days', 1)

    fireEvent.click(screen.getAllByTitle(/Schedule: Morning Review/)[0])
    expect(onOpenSchedule).toHaveBeenCalledWith('sched-today')
  })
})
