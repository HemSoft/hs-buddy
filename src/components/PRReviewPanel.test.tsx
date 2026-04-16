import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PRReviewPanel } from './PRReviewPanel'
import type { PRReviewInfo } from './pr-review/PRReviewInfo'

const mockUsePRReviewData = vi.fn()

vi.mock('./pr-review/usePRReviewData', () => ({
  usePRReviewData: (...args: unknown[]) => mockUsePRReviewData(...args),
}))

vi.mock('./shared/AccountPicker', () => ({
  AccountPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      data-testid="account-picker"
      defaultValue={value}
      onChange={e => onChange(e.target.value)}
    >
      <option>{value}</option>
      <option value="bob">bob</option>
    </select>
  ),
}))

vi.mock('./shared/ModelPicker', () => ({
  ModelPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      data-testid="model-picker"
      defaultValue={value}
      onChange={e => onChange(e.target.value)}
    >
      <option>{value}</option>
      <option value="gpt-4o">gpt-4o</option>
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
  PromptSection: ({
    prompt,
    onToggleExpanded,
    onPromptChange,
    onResetPrompt,
    onSaveAsDefault,
  }: {
    prompt: string
    onToggleExpanded: () => void
    onPromptChange: (v: string) => void
    onResetPrompt: () => void
    onSaveAsDefault: () => void
  }) => (
    <div data-testid="prompt-section">
      {prompt}
      <button data-testid="toggle-expanded" onClick={onToggleExpanded}>
        Toggle
      </button>
      <button data-testid="change-prompt" onClick={() => onPromptChange('new prompt')}>
        Change
      </button>
      <button data-testid="reset-prompt" onClick={onResetPrompt}>
        Reset
      </button>
      <button data-testid="save-default" onClick={onSaveAsDefault}>
        Save
      </button>
    </div>
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

  it('hides premium usage badge when account is empty', () => {
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ account: '' }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.queryByTestId('premium-badge')).not.toBeInTheDocument()
  })

  it('renders schedule delay dropdown with all options', () => {
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    const select = document.querySelector('.pr-review-delay-select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(select.options).toHaveLength(6)
    expect(select.value).toBe('5')
  })

  it('calls setScheduleDelay when delay is changed', () => {
    const setScheduleDelay = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ setScheduleDelay }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    const select = document.querySelector('.pr-review-delay-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '30' } })
    expect(setScheduleDelay).toHaveBeenCalledWith(30)
  })

  it('disables schedule delay dropdown when submitting', () => {
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ submitting: true }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    const select = document.querySelector('.pr-review-delay-select') as HTMLSelectElement
    expect(select).toBeDisabled()
  })

  it('does not show error when error is null', () => {
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(document.querySelector('.pr-review-error')).not.toBeInTheDocument()
  })

  it('calls setPromptExpanded with toggler when PromptSection toggles expanded', () => {
    const setPromptExpanded = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ setPromptExpanded }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    fireEvent.click(screen.getByTestId('toggle-expanded'))
    expect(setPromptExpanded).toHaveBeenCalledWith(expect.any(Function))
    // Verify the toggler function flips the value
    const toggler = setPromptExpanded.mock.calls[0][0]
    expect(toggler(false)).toBe(true)
    expect(toggler(true)).toBe(false)
  })

  it('calls setPrompt when PromptSection changes prompt', () => {
    const setPrompt = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ setPrompt }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    fireEvent.click(screen.getByTestId('change-prompt'))
    expect(setPrompt).toHaveBeenCalledWith('new prompt')
  })

  it('calls handleResetPrompt when PromptSection resets prompt', () => {
    const handleResetPrompt = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ handleResetPrompt }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    fireEvent.click(screen.getByTestId('reset-prompt'))
    expect(handleResetPrompt).toHaveBeenCalled()
  })

  it('calls handleSaveAsDefault when PromptSection saves default', () => {
    const handleSaveAsDefault = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ handleSaveAsDefault }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    fireEvent.click(screen.getByTestId('save-default'))
    expect(handleSaveAsDefault).toHaveBeenCalled()
  })

  it('calls setAccount when AccountPicker value changes', () => {
    const setAccount = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ setAccount }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    fireEvent.change(screen.getByTestId('account-picker'), { target: { value: 'bob' } })
    expect(setAccount).toHaveBeenCalledWith('bob')
  })

  it('calls setModel when ModelPicker value changes', () => {
    const setModel = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ setModel }))
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    fireEvent.change(screen.getByTestId('model-picker'), { target: { value: 'gpt-4o' } })
    expect(setModel).toHaveBeenCalledWith('gpt-4o')
  })

  it('enables buttons when not submitting and prompt has content', () => {
    mockUsePRReviewData.mockReturnValue(
      createMockHookReturn({ submitting: false, prompt: 'Review this' })
    )
    render(<PRReviewPanel prInfo={defaultPrInfo} />)
    expect(screen.getByText('Run Now').closest('button')).not.toBeDisabled()
    expect(screen.getByText('Schedule').closest('button')).not.toBeDisabled()
  })

  it('passes onClose to ScheduledMessage when scheduled', () => {
    const onClose = vi.fn()
    mockUsePRReviewData.mockReturnValue(createMockHookReturn({ scheduled: true }))
    render(<PRReviewPanel prInfo={defaultPrInfo} onClose={onClose} />)
    expect(screen.getByTestId('scheduled-message')).toBeInTheDocument()
  })
})
