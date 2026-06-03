import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
      sourceJson: '{\n  "User": "fhemmerrelias",\n  "Success": true\n}',
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
    expect(document.querySelectorAll('.enterprise-users-row')).toHaveLength(3)
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
    expect(document.querySelectorAll('.enterprise-users-row')).toHaveLength(0)
    expect(screen.getByText('0 of 3 users')).toBeInTheDocument()
  })

  it('opens the source JSON modal when a user row is clicked', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View source JSON for fhemmerrelias'))

    expect(screen.getByRole('dialog', { name: 'fhemmerrelias' })).toBeInTheDocument()
    expect(screen.getByLabelText('Close source JSON dialog')).toHaveFocus()
    expect(screen.getByText(snapshot.sourceFile)).toBeInTheDocument()
    expect(screen.getByText(/"User": "fhemmerrelias"/)).toBeInTheDocument()
  })

  it('closes the source JSON modal from the close button', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View source JSON for fhemmerrelias'))
    fireEvent.click(screen.getByLabelText('Close source JSON dialog'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the source JSON modal with Escape', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View source JSON for fhemmerrelias'))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps tab focus inside the source JSON modal', () => {
    render(<TopUsersSection />)

    fireEvent.click(screen.getByTitle('View source JSON for fhemmerrelias'))
    const closeButton = screen.getByLabelText('Close source JSON dialog')

    expect(closeButton).toHaveFocus()
    fireEvent.keyDown(closeButton, { key: 'Tab' })
    expect(closeButton).toHaveFocus()
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
    expect(closeButton).toHaveFocus()
  })

  it('restores focus when the source JSON modal closes', () => {
    render(<TopUsersSection />)
    const row = screen.getByTitle('View source JSON for fhemmerrelias')

    row.focus()
    fireEvent.click(row)
    fireEvent.click(screen.getByLabelText('Close source JSON dialog'))

    expect(row).toHaveFocus()
  })

  it('does not render a loading spinner for file data', () => {
    render(<TopUsersSection />)
    expect(document.querySelector('.spin')).not.toBeInTheDocument()
  })

  it('shows source errors without a spinner', () => {
    mockUseCopilotEnterpriseUsers.mockReturnValue({
      data: null,
      loading: false,
      error: 'copilot-metrics.json was not found',
    })

    render(<TopUsersSection />)

    expect(screen.getByText('copilot-metrics.json was not found')).toBeInTheDocument()
    expect(document.querySelector('.spin')).not.toBeInTheDocument()
  })
})
