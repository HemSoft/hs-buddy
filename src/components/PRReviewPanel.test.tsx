import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PRReviewPanel } from './PRReviewPanel'
import type { PRReviewInfo } from './pr-review/PRReviewInfo'

const mockUsePRReviewData = vi.fn()

vi.mock('./pr-review/usePRReviewData', () => ({
  usePRReviewData: (...args: unknown[]) => mockUsePRReviewData(...args),
}))

vi.mock('./shared/AccountPicker', () => ({
  AccountPicker: ({ value }: { value: string }) => (
    <select data-testid="account-picker" defaultValue={value}>
      <option>{value}</option>
    </select>
  ),
}))

vi.mock('./shared/ModelPicker', () => ({
  ModelPicker: ({ value }: { value: string }) => (
    <select data-testid="model-picker" defaultValue={value}>
      <option>{value}</option>
    </select>
  ),
}))

vi.mock('./shared/PremiumUsageBadge', () => ({
  PremiumUsageBadge: () => <span data-testid="premium-badge" />,
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
  ScheduledMessage: ({ prTitle, scheduleDelay }: { prTitle: string; scheduleDelay: number }) => (
    <div data-testid="scheduled-message">
      Scheduled: {prTitle} in {scheduleDelay} min
    </div>
  ),
}))

const defaultPrInfo: PRReviewInfo = {
  prUrl: 'https://github.com/org/repo/pull/42',
  prTitle: 'Fix login bug',
  prNumber: 42,
  repo: 'repo',
  org: 'org',
  author: 'octocat',
}

function createMockHookReturn(overrides: Record<string, unknown> = {}) {
  return {
    account: 'alice',
    setAccount: vi.fn(),
    model: 'claude-sonnet-4.5',
    setModel: vi.fn(),
    prompt: 'Review this PR',
    setPrompt: vi.fn(),
    promptExpanded: false,
    setPromptExpanded: vi.fn(),
    submitting: false,
    error: null,
    scheduled: false,
    scheduleDelay: 5,
    setScheduleDelay: vi.fn(),
    savingDefault: false,
    handleRunNow: vi.fn(),
    handleSchedule: vi.fn(),
    handleResetPrompt: vi.fn(),
    handleSaveAsDefault: vi.fn(),
    ...overrides,
  }
}

describe('PRReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn())
  })

  it('renders the review panel with header and subcomponents', () => {
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByText('PR Review')).toBeInTheDocument()
    expect(screen.getByTestId('pr-info-card')).toHaveTextContent('Fix login bug')
    expect(screen.getByTestId('prompt-section')).toBeInTheDocument()
  })

  it('renders account and model pickers', () => {
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByTestId('account-picker')).toBeInTheDocument()
    expect(screen.getByTestId('model-picker')).toBeInTheDocument()
  })

  it('shows premium usage badge when account is set', () => {
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByTestId('premium-badge')).toBeInTheDocument()
  })

  it('renders Run Now and Schedule buttons', () => {
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByText('Run Now')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
  })

  it('calls handleRunNow when Run Now is clicked', () => {
    const handleRunNow = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ handleRunNow }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    fireEvent.click(screen.getByText('Run Now'))
    expect(handleRunNow).toHaveBeenCalled()
  })

  it('calls handleSchedule when Schedule is clicked', () => {
    const handleSchedule = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ handleSchedule }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    fireEvent.click(screen.getByText('Schedule'))
    expect(handleSchedule).toHaveBeenCalled()
  })

  it('disables buttons when submitting', () => {
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ submitting: true }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByText('Run Now').closest('button')).toBeDisabled()
    expect(screen.getByText('Schedule').closest('button')).toBeDisabled()
  })

  it('disables buttons when prompt is empty', () => {
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ prompt: '   ' }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByText('Run Now').closest('button')).toBeDisabled()
    expect(screen.getByText('Schedule').closest('button')).toBeDisabled()
  })

  it('shows error message when error exists', () => {
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ error: 'Something went wrong' }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows scheduled message when scheduled is true', () => {
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ scheduled: true }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByTestId('scheduled-message')).toHaveTextContent(
      'Scheduled: Fix login bug in 5 min'
    )
    expect(screen.queryByText('PR Review')).not.toBeInTheDocument()
  })

  it('renders close button when onClose is provided', () => {
    const onClose = vi.fn()
    render(<PRReviewPanel prInfo={defaultPrInfo} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render close button when onClose is not provided', () => {
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.queryByTitle('Close')).not.toBeInTheDocument()
  })

  it('passes prInfo and onSubmitted to usePRReviewData hook', () => {
    const onSubmitted = vi.fn()
    render(<PRReviewPanel prInfo={defaultPrInfo} onSubmitted={onSubmitted} />)
    expect(mockUsePRReviewData).toHaveBeenCalledWith(defaultPrInfo, onSubmitted)
  })
})
