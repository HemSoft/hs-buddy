import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PRReviewPanel } from './PRReviewPanel'
import type { PRReviewInfo } from './pr-review/PRReviewInfo'

const mockHandleRunNow = vi.fn()
const mockHandleSchedule = vi.fn()
const mockHandleResetPrompt = vi.fn()
const mockHandleSaveAsDefault = vi.fn()
const mockSetAccount = vi.fn()
const mockSetModel = vi.fn()
const mockSetPrompt = vi.fn()
const mockSetPromptExpanded = vi.fn()
const mockSetScheduleDelay = vi.fn()

let mockReviewData = {
  account: 'alice',
  setAccount: mockSetAccount,
  model: 'claude-sonnet-4.5',
  setModel: mockSetModel,
  prompt: 'Review this PR for bugs and issues',
  setPrompt: mockSetPrompt,
  promptExpanded: false,
  setPromptExpanded: mockSetPromptExpanded,
  submitting: false,
  error: null as string | null,
  scheduled: false,
  scheduleDelay: 5,
  setScheduleDelay: mockSetScheduleDelay,
  savingDefault: false,
  handleRunNow: mockHandleRunNow,
  handleSchedule: mockHandleSchedule,
  handleResetPrompt: mockHandleResetPrompt,
  handleSaveAsDefault: mockHandleSaveAsDefault,
}

vi.mock('./pr-review/usePRReviewData', () => ({
  usePRReviewData: () => mockReviewData,
}))

vi.mock('./shared/AccountPicker', () => ({
  AccountPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select data-testid="account-picker" value={value} onChange={e => onChange(e.target.value)}>
      <option value="alice">alice</option>
    </select>
  ),
}))

vi.mock('./shared/ModelPicker', () => ({
  ModelPicker: ({ value }: { value: string }) => <span data-testid="model-picker">{value}</span>,
}))

vi.mock('./shared/PremiumUsageBadge', () => ({
  PremiumUsageBadge: ({ username }: { username: string }) => (
    <span data-testid="premium-badge">{username}</span>
  ),
}))

vi.mock('./pr-review/PRInfoCard', () => ({
  PRInfoCard: ({ prTitle }: { prTitle: string }) => <div data-testid="pr-info-card">{prTitle}</div>,
}))

vi.mock('./pr-review/PromptSection', () => ({
  PromptSection: ({ prompt }: { prompt: string }) => (
    <div data-testid="prompt-section">{prompt}</div>
  ),
}))

vi.mock('./pr-review/ScheduledMessage', () => ({
  ScheduledMessage: ({ prTitle }: { prTitle: string }) => (
    <div data-testid="scheduled-message">Scheduled: {prTitle}</div>
  ),
}))

const prInfo: PRReviewInfo = {
  prUrl: 'https://github.com/org/repo/pull/42',
  prTitle: 'Fix login bug',
  prNumber: 42,
  repo: 'repo',
  org: 'org',
  author: 'bob',
}

describe('PRReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReviewData = {
      account: 'alice',
      setAccount: mockSetAccount,
      model: 'claude-sonnet-4.5',
      setModel: mockSetModel,
      prompt: 'Review this PR for bugs and issues',
      setPrompt: mockSetPrompt,
      promptExpanded: false,
      setPromptExpanded: mockSetPromptExpanded,
      submitting: false,
      error: null,
      scheduled: false,
      scheduleDelay: 5,
      setScheduleDelay: mockSetScheduleDelay,
      savingDefault: false,
      handleRunNow: mockHandleRunNow,
      handleSchedule: mockHandleSchedule,
      handleResetPrompt: mockHandleResetPrompt,
      handleSaveAsDefault: mockHandleSaveAsDefault,
    }
  })

  it('renders the review panel header', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByText('PR Review')).toBeInTheDocument()
  })

  it('renders PR info card with title', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByTestId('pr-info-card')).toHaveTextContent('Fix login bug')
  })

  it('renders account and model pickers', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByTestId('account-picker')).toBeInTheDocument()
    expect(screen.getByTestId('model-picker')).toBeInTheDocument()
  })

  it('shows premium badge when account is selected', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByTestId('premium-badge')).toHaveTextContent('alice')
  })

  it('renders Run Now and Schedule buttons', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByText('Run Now')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
  })

  it('calls handleRunNow on Run Now click', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    fireEvent.click(screen.getByText('Run Now'))
    expect(mockHandleRunNow).toHaveBeenCalledTimes(1)
  })

  it('calls handleSchedule on Schedule click', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    fireEvent.click(screen.getByText('Schedule'))
    expect(mockHandleSchedule).toHaveBeenCalledTimes(1)
  })

  it('disables buttons when submitting', () => {
    mockReviewData.submitting = true
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByText('Run Now').closest('button')).toBeDisabled()
    expect(screen.getByText('Schedule').closest('button')).toBeDisabled()
  })

  it('disables buttons when prompt is empty', () => {
    mockReviewData.prompt = '   '
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByText('Run Now').closest('button')).toBeDisabled()
    expect(screen.getByText('Schedule').closest('button')).toBeDisabled()
  })

  it('shows error message when error is set', () => {
    mockReviewData.error = 'Rate limit exceeded'
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
  })

  it('shows scheduled message when scheduled is true', () => {
    mockReviewData.scheduled = true
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.getByTestId('scheduled-message')).toHaveTextContent('Scheduled: Fix login bug')
  })

  it('renders close button when onClose is provided', () => {
    const onClose = vi.fn()
    render(<PRReviewPanel prInfo={prInfo} onClose={onClose} />)
    const closeBtn = screen.getByTitle('Close')
    expect(closeBtn).toBeInTheDocument()
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not render close button when onClose is not provided', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    expect(screen.queryByTitle('Close')).not.toBeInTheDocument()
  })

  it('renders schedule delay select', () => {
    render(<PRReviewPanel prInfo={prInfo} />)
    const select = screen.getByDisplayValue('5 min')
    expect(select).toBeInTheDocument()
  })
})
