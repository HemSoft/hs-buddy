import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { CronBuilder } from './CronBuilder'

describe('CronBuilder', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the current daily schedule and preview', () => {
    render(<CronBuilder value="15 13 * * *" onChange={onChange} />)

    expect(screen.getByText('Run Frequency')).toBeInTheDocument()
    expect(screen.getByText('Daily')).toHaveClass('active')
    expect(screen.getByText('Runs daily at 1:15 PM')).toBeInTheDocument()
    expect(screen.getByText('15 13 * * *')).toBeInTheDocument()
  })

  it('updates the cron expression when switching to hourly and changing the minute', () => {
    function Harness() {
      const [value, setValue] = useState('15 13 * * *')

      return (
        <CronBuilder
          value={value}
          onChange={cron => {
            onChange(cron)
            setValue(cron)
          }}
        />
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByText('Hourly'))
    expect(onChange).toHaveBeenLastCalledWith('15 * * * *')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '45' } })
    expect(onChange).toHaveBeenLastCalledWith('45 * * * *')
  })

  it('renders and updates a custom cron expression', () => {
    render(<CronBuilder value="invalid cron" onChange={onChange} />)

    const input = screen.getByPlaceholderText('* * * * *')
    expect(screen.getByText('Custom')).toHaveClass('active')
    expect(input).toHaveValue('invalid cron')
    expect(screen.getByText('Custom cron expression')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '*/5 * * * 1-5' } })
    expect(onChange).toHaveBeenCalledWith('*/5 * * * 1-5')
  })

  it('does not allow removing the last selected weekly day', () => {
    render(<CronBuilder value="0 9 * * 1" onChange={onChange} />)

    fireEvent.click(screen.getByTitle('Mon'))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders minute frequency with correct description', () => {
    render(<CronBuilder value="* * * * *" onChange={onChange} />)

    expect(screen.getByText('Every Minute')).toHaveClass('active')
    expect(screen.getByText('Runs every minute')).toBeInTheDocument()
    expect(screen.getByText('* * * * *')).toBeInTheDocument()
  })

  it('renders monthly frequency with correct description and day selector', () => {
    render(<CronBuilder value="30 14 15 * *" onChange={onChange} />)

    expect(screen.getByText('Monthly')).toHaveClass('active')
    expect(screen.getByText('Runs on day 15 of every month at 2:30 PM')).toBeInTheDocument()

    // Verify day-of-month selector is present
    const daySelect = screen.getByDisplayValue('15')
    expect(daySelect).toBeInTheDocument()
  })

  it('switches to minute frequency', () => {
    function Harness() {
      const [value, setValue] = useState('0 9 * * *')

      return (
        <CronBuilder
          value={value}
          onChange={cron => {
            onChange(cron)
            setValue(cron)
          }}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByText('Every Minute'))
    expect(onChange).toHaveBeenLastCalledWith('* * * * *')
  })

  it('switches to monthly frequency and updates day of month', () => {
    function Harness() {
      const [value, setValue] = useState('0 9 * * *')

      return (
        <CronBuilder
          value={value}
          onChange={cron => {
            onChange(cron)
            setValue(cron)
          }}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByText('Monthly'))
    expect(onChange).toHaveBeenLastCalledWith('0 9 1 * *')

    // Change the day of month
    const daySelect = screen.getByDisplayValue('1')
    fireEvent.change(daySelect, { target: { value: '15' } })
    expect(onChange).toHaveBeenLastCalledWith('0 9 15 * *')
  })

  it('switches to custom frequency and shows raw input', () => {
    function Harness() {
      const [value, setValue] = useState('0 9 * * *')

      return (
        <CronBuilder
          value={value}
          onChange={cron => {
            onChange(cron)
            setValue(cron)
          }}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByText('Custom'))
    // buildCronExpression returns the raw value for custom, so onChange receives it
    expect(onChange).toHaveBeenCalled()
  })

  it('renders custom frequency with input field and format hints', () => {
    // Custom frequency is shown when the cron value doesn't match known patterns
    render(<CronBuilder value="*/5 3-7 1,15 * 1-5" onChange={onChange} />)

    expect(screen.getByText('Custom')).toHaveClass('active')
    expect(screen.getByText('Custom cron expression')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('* * * * *')).toBeInTheDocument()

    // Verify format hint labels
    expect(screen.getByText('minute')).toBeInTheDocument()
    expect(screen.getByText('hour')).toBeInTheDocument()
    expect(screen.getByText('weekday')).toBeInTheDocument()
  })

  it('adds a day to the weekly schedule', () => {
    function Harness() {
      const [value, setValue] = useState('0 9 * * 1')

      return (
        <CronBuilder
          value={value}
          onChange={cron => {
            onChange(cron)
            setValue(cron)
          }}
        />
      )
    }

    render(<Harness />)

    // Mon is selected, click Wed to add it
    fireEvent.click(screen.getByTitle('Wed'))
    expect(onChange).toHaveBeenLastCalledWith('0 9 * * 1,3')
  })

  it('removes a day from multi-day weekly schedule', () => {
    function Harness() {
      const [value, setValue] = useState('0 9 * * 1,3,5')

      return (
        <CronBuilder
          value={value}
          onChange={cron => {
            onChange(cron)
            setValue(cron)
          }}
        />
      )
    }

    render(<Harness />)

    // Remove Wed (day 3) — Mon and Fri should remain
    fireEvent.click(screen.getByTitle('Wed'))
    expect(onChange).toHaveBeenLastCalledWith('0 9 * * 1,5')
  })

  it('renders weekly description with multiple days', () => {
    render(<CronBuilder value="0 9 * * 1,3,5" onChange={onChange} />)

    expect(screen.getByText('Weekly')).toHaveClass('active')
    expect(screen.getByText('Runs every Mon, Wed, Fri at 9:00 AM')).toBeInTheDocument()
  })
})
