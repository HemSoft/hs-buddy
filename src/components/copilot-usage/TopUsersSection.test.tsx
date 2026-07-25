import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TopUsersSection } from './TopUsersSection'
import type { CopilotEnterpriseUsersSnapshot } from '../../types/copilotEnterpriseUsers'

const mockUseCopilotEnterpriseUsers = vi.fn()

vi.mock('../../hooks/useCopilotEnterpriseUsers', () => ({
  useCopilotEnterpriseUsers: (refreshToken?: number) => mockUseCopilotEnterpriseUsers(refreshToken),
}))

const snapshot: CopilotEnterpriseUsersSnapshot = {
  generatedAt: '2026-06-02T02:30:20.000Z',
  fileLastWriteTime: '2026-06-02T02:30:20.000Z',
  sourceFile: 'D:\\github\\HemSoft\\codexbar\\data\\copilot-metrics.json',
  enterprise: 'bertelsmann',
  organization: 'Relias-Engineering',
  year: 2026,
  month: 6,
  days: [1, 2],
  totalUsers: 3,
  activeUsers: 2,
  users: [
    {
      login: 'fhemmerrelias',
      grossQuantity: 11540.58,
      grossAmount: 115.41,
      netAmount: 0,
      modelCount: 2,
      topModel: 'Claude Opus 4.8',
      topModelQuantity: 7000,
      success: true,
      errorMessage: null,
      sourceJson: JSON.stringify(
        {
          User: 'fhemmerrelias',
          Success: true,
          Responses: [
            {
              Day: 1,
              Response: {
                usageItems: [
                  {
                    model: 'Claude Opus 4.8',
                    grossQuantity: 7000,
                    grossAmount: 70,
                    netAmount: 0,
                  },
                  {
                    model: 'Code Review model',
                    grossQuantity: 4540.58,
                    grossAmount: 45.41,
                    netAmount: 0,
                  },
                ],
              },
            },
          ],
        },
        null,
        2
      ),
    },
    {
      login: 'vgautamRelias',
      grossQuantity: 4907.36,
      grossAmount: 49.07,
      netAmount: 0,
      modelCount: 1,
      topModel: 'Claude Opus 4.6',
      topModelQuantity: 4907.36,
      success: true,
      errorMessage: null,
      sourceJson: '{\n  "User": "vgautamRelias",\n  "Success": true\n}',
    },
    {
      login: 'aantony-relias',
      grossQuantity: 0,
      grossAmount: 0,
      netAmount: 0,
      modelCount: 0,
      topModel: null,
      topModelQuantity: 0,
      success: true,
      errorMessage: null,
      sourceJson: '{\n  "User": "aantony-relias",\n  "Success": true\n}',
    },
  ],
}

describe('TopUsersSection', () => {
  beforeEach(() => {
    mockUseCopilotEnterpriseUsers.mockClear()
    mockUseCopilotEnterpriseUsers.mockReturnValue({ data: snapshot, loading: false, error: null })
  })

  it('renders the Copilot enterprise users title', () => {
    render(<TopUsersSection />)
    expect(screen.getByText('Copilot Enterprise Users')).toBeInTheDocument()
    expect(screen.queryByText('Top AI Credit Users')).not.toBeInTheDocument()
  })

  it('passes refresh tokens into the Enterprise users loader', () => {
    const { rerender } = render(<TopUsersSection refreshToken={1} />)
    rerender(<TopUsersSection refreshToken={2} />)

    expect(mockUseCopilotEnterpriseUsers).toHaveBeenNthCalledWith(1, 1)
    expect(mockUseCopilotEnterpriseUsers).toHaveBeenNthCalledWith(2, 2)
  })

  it('shows snapshot update and user-count metadata', () => {
    render(<TopUsersSection />)
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
    expect(screen.getByText('Relias-Engineering')).toBeInTheDocument()
    expect(screen.getByText('3 users')).toBeInTheDocument()
    expect(screen.getByText('2 active')).toBeInTheDocument()
  })

  it('omits organization metadata when the snapshot has no organization', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: { ...snapshot, organization: '' },
      loading: false,
      error: null,
    })

    render(<TopUsersSection />)

    expect(screen.queryByText('Relias-Engineering')).not.toBeInTheDocument()
    expect(screen.getByText('3 users')).toBeInTheDocument()
  })

  it('uses a safe fallback for invalid snapshot update dates', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: { ...snapshot, generatedAt: 'not-a-date' },
      loading: false,
      error: null,
    })

    render(<TopUsersSection />)

    expect(screen.getByText('Updated Unknown date')).toBeInTheDocument()
  })

  it('renders one table row per enterprise user from the metrics file', () => {
    render(<TopUsersSection />)
    expect(screen.getAllByTitle(/View usage details for /)).toHaveLength(3)
  })

  it('renders high-usage users with credit and dollar totals', () => {
    render(<TopUsersSection />)
    expect(screen.getByText('fhemmerrelias')).toBeInTheDocument()
    expect(screen.getByText('11,541')).toBeInTheDocument()
    expect(screen.getByText('$115.41')).toBeInTheDocument()
    expect(screen.queryByText('Net')).not.toBeInTheDocument()
    expect(screen.getByText('Claude Opus 4.8')).toBeInTheDocument()
  })

  it('includes users with no usage instead of dropping them', () => {
    render(<TopUsersSection />)
    expect(screen.getByText('aantony-relias')).toBeInTheDocument()
    expect(screen.getAllByText('No usage').length).toBeGreaterThan(0)
  })

  it('shows failed status for unsuccessful enterprise user records', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: {
        ...snapshot,
        users: [{ ...snapshot.users[0], success: false, errorMessage: 'API failed' }],
      },
      loading: false,
      error: null,
    })

    render(<TopUsersSection />)

    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('filters users by login text', () => {
    render(<TopUsersSection />)

    fireEvent.change(screen.getByLabelText('Filter Copilot Enterprise users'), {
      target: { value: 'vgautam' },
    })

    expect(screen.getByText('vgautamRelias')).toBeInTheDocument()
    expect(screen.queryByText('fhemmerrelias')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 3 users')).toBeInTheDocument()
  })

  it('shows an empty match message when the filter excludes all users', () => {
    render(<TopUsersSection />)

    fireEvent.change(screen.getByLabelText('Filter Copilot Enterprise users'), {
      target: { value: 'missing-user' },
    })

    expect(screen.getByText('No users match this filter.')).toBeInTheDocument()
    expect(screen.queryByTitle(/View usage details for /)).not.toBeInTheDocument()
    expect(screen.getByText('0 of 3 users')).toBeInTheDocument()
  })

  it('shows a loading message before Enterprise users are available', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: null,
      loading: true,
      error: null,
    })

    render(<TopUsersSection />)

    expect(screen.getByText('Loading Copilot Enterprise users...')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter Copilot Enterprise users')).not.toBeInTheDocument()
  })

  it('omits content and controls when no Enterprise users state is available', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: null,
      loading: false,
      error: null,
    })

    render(<TopUsersSection />)

    expect(screen.getByText('Copilot Enterprise Users')).toBeInTheDocument()
    expect(screen.queryByText('Loading Copilot Enterprise users...')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter Copilot Enterprise users')).not.toBeInTheDocument()
    expect(screen.queryByText(snapshot.users[0].login)).not.toBeInTheDocument()
  })

  it('shows an empty users message without rendering the filter panel', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: { ...snapshot, totalUsers: 0, activeUsers: 0, users: [] },
      loading: false,
      error: null,
    })

    render(<TopUsersSection />)

    expect(screen.getByText('No Copilot Enterprise users found.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter Copilot Enterprise users')).not.toBeInTheDocument()
  })

  it('opens a polished overview by default when a user row is clicked', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))

    expect(screen.getByRole('dialog', { name: 'fhemmerrelias' })).toBeInTheDocument()
    expect(screen.getByLabelText('Close user details dialog')).toHaveFocus()
    expect(screen.getByText(snapshot.sourceFile)).toBeInTheDocument()
    expect(screen.getByText('AI credit footprint')).toBeInTheDocument()
    expect(screen.getByText('Model mix')).toBeInTheDocument()
    expect(screen.getByText('Daily rhythm')).toBeInTheDocument()
    expect(screen.queryByText(/"User": "fhemmerrelias"/)).not.toBeInTheDocument()
  })

  it('toggles between the overview and the original source JSON', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))
    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }))

    expect(screen.getByText(/"User": "fhemmerrelias"/)).toBeInTheDocument()
    expect(screen.queryByText('AI credit footprint')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(screen.getByText('AI credit footprint')).toBeInTheDocument()
    expect(screen.queryByText(/"User": "fhemmerrelias"/)).not.toBeInTheDocument()
  })

  it('shows unavailable average activity when daily source data is absent', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: {
        ...snapshot,
        users: [
          {
            ...snapshot.users[0],
            sourceJson: JSON.stringify({
              User: 'fhemmerrelias',
              grossQuantity: 11540.58,
              topModel: 'Claude Opus 4.8',
            }),
          },
        ],
      },
      loading: false,
      error: null,
    })
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))

    const averageCard = screen.getByText('Avg. active day').closest('article')
    expect(averageCard).not.toBeNull()
    expect(within(averageCard!).getByText('—')).toBeInTheDocument()
  })

  it('includes model-less source items in daily activity totals', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: {
        ...snapshot,
        users: [
          {
            ...snapshot.users[0],
            grossQuantity: 420,
            grossAmount: 4.2,
            modelCount: 0,
            topModel: null,
            topModelQuantity: 0,
            sourceJson: JSON.stringify({
              User: 'fhemmerrelias',
              Responses: [
                {
                  Day: 4,
                  Response: {
                    usageItems: [{ grossQuantity: 420, grossAmount: 4.2, netAmount: 0 }],
                  },
                },
              ],
            }),
          },
        ],
      },
      loading: false,
      error: null,
    })
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))

    expect(screen.getByText('D4')).toBeInTheDocument()
    expect(screen.getAllByText('420').length).toBeGreaterThan(0)
  })

  it('closes the user details modal from the close button', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))
    fireEvent.click(screen.getByLabelText('Close user details dialog'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the user details modal with Escape', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps tab focus inside the user details modal', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))
    const closeButton = screen.getByLabelText('Close user details dialog')
    const jsonTab = screen.getByRole('tab', { name: 'JSON' })

    expect(closeButton).toHaveFocus()
    const backwardEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    closeButton.dispatchEvent(backwardEvent)
    expect(backwardEvent.defaultPrevented).toBe(true)
    expect(jsonTab).toHaveFocus()

    const forwardEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    jsonTab.dispatchEvent(forwardEvent)
    expect(forwardEvent.defaultPrevented).toBe(true)
    expect(closeButton).toHaveFocus()
  })

  it('wraps focus forward when Tab is handled by the dialog', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))
    const dialog = screen.getByRole('dialog', { name: 'fhemmerrelias' })
    const closeButton = screen.getByLabelText('Close user details dialog')
    const jsonTab = screen.getByRole('tab', { name: 'JSON' })

    jsonTab.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    dialog.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(closeButton).toHaveFocus()
  })

  it('does not intercept Tab when modal focus is not on a boundary control', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))
    const dialog = screen.getByRole('dialog', { name: 'fhemmerrelias' })
    const overviewTab = screen.getByRole('tab', { name: 'Overview' })

    overviewTab.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    dialog.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('keeps focus on the user details modal when no focusable elements remain', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))
    const dialog = screen.getByRole('dialog', { name: 'fhemmerrelias' })
    for (const button of dialog.querySelectorAll('button')) button.setAttribute('disabled', '')

    dialog.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    dialog.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dialog).toHaveFocus()
  })

  it('does not trap non-Tab keys in the source JSON modal', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View usage details for fhemmerrelias'))
    const dialog = screen.getByRole('dialog', { name: 'fhemmerrelias' })

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    dialog.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(dialog).toBeInTheDocument()
  })

  it('restores focus when the source JSON modal closes', () => {
    render(<TopUsersSection />)
    const row = screen.getByTitle('View usage details for fhemmerrelias')

    row.focus()
    fireEvent.click(row)
    fireEvent.click(screen.getByLabelText('Close user details dialog'))

    expect(row).toHaveFocus()
  })

  it('does not render a loading spinner for file data', () => {
    render(<TopUsersSection />)
    expect(screen.queryByText('Loading Copilot Enterprise users...')).not.toBeInTheDocument()
  })

  it('shows source errors without a spinner', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: null,
      loading: false,
      error: 'copilot-metrics.json was not found',
    })

    render(<TopUsersSection />)

    expect(screen.getByText('copilot-metrics.json was not found')).toBeInTheDocument()
    expect(screen.queryByText('Loading Copilot Enterprise users...')).not.toBeInTheDocument()
  })
})
