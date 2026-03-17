import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduledMessage } from './ScheduledMessage'

describe('ScheduledMessage', () => {
  it('renders the "PR Review Scheduled" heading', () => {
    render(<ScheduledMessage prTitle="Fix bug" scheduleDelay={5} />)

    expect(screen.getByRole('heading', { name: 'PR Review Scheduled' })).toBeInTheDocument()
  })

  it('renders the PR title in the message', () => {
    render(<ScheduledMessage prTitle="Add login page" scheduleDelay={3} />)

    expect(screen.getByText('Add login page')).toBeInTheDocument()
  })

  it('shows plural "minutes" when scheduleDelay is not 1', () => {
    render(<ScheduledMessage prTitle="Fix bug" scheduleDelay={5} />)

    expect(screen.getByText('5 minutes')).toBeInTheDocument()
  })

  it('shows singular "minute" when scheduleDelay is 1', () => {
    render(<ScheduledMessage prTitle="Fix bug" scheduleDelay={1} />)

    expect(screen.getByText('1 minute')).toBeInTheDocument()
  })

  it('renders the hint about Copilot results', () => {
    render(<ScheduledMessage prTitle="Fix bug" scheduleDelay={2} />)

    expect(
      screen.getByText('The result will appear in the Copilot results list when complete.')
    ).toBeInTheDocument()
  })

  it('shows close button when onClose is provided', () => {
    render(<ScheduledMessage prTitle="Fix bug" scheduleDelay={2} onClose={() => {}} />)

    expect(screen.getByTitle('Close')).toBeInTheDocument()
  })

  it('does not show close button when onClose is omitted', () => {
    render(<ScheduledMessage prTitle="Fix bug" scheduleDelay={2} />)

    expect(screen.queryByTitle('Close')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ScheduledMessage prTitle="Fix bug" scheduleDelay={2} onClose={onClose} />)

    await user.click(screen.getByTitle('Close'))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows plural "minutes" when scheduleDelay is 0', () => {
    render(<ScheduledMessage prTitle="Fix bug" scheduleDelay={0} />)

    expect(screen.getByText('0 minutes')).toBeInTheDocument()
  })
})
