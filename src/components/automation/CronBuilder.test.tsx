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
})
