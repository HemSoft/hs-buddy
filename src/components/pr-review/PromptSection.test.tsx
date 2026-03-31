import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptSection } from './PromptSection'

describe('PromptSection', () => {
  const defaultProps = {
    prompt: 'Review this PR for bugs and security issues.',
    promptExpanded: false,
    submitting: false,
    savingDefault: false,
    onPromptChange: vi.fn(),
    onToggleExpanded: vi.fn(),
    onResetPrompt: vi.fn(),
    onSaveAsDefault: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows prompt label', () => {
    render(<PromptSection {...defaultProps} />)
    expect(screen.getByText('Prompt')).toBeTruthy()
  })

  it('shows collapsed preview when not expanded', () => {
    render(<PromptSection {...defaultProps} />)
    expect(screen.getByText('Click to edit')).toBeTruthy()
    expect(screen.getByText('Review this PR for bugs and security issues.')).toBeTruthy()
  })

  it('shows textarea when expanded', () => {
    render(<PromptSection {...defaultProps} promptExpanded={true} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('Review this PR for bugs and security issues.')
  })

  it('shows char count when expanded', () => {
    render(<PromptSection {...defaultProps} promptExpanded={true} />)
    expect(screen.getByText('44 chars')).toBeTruthy()
  })

  it('calls onToggleExpanded when header clicked', () => {
    render(<PromptSection {...defaultProps} />)
    fireEvent.click(screen.getByText('Prompt'))
    expect(defaultProps.onToggleExpanded).toHaveBeenCalledOnce()
  })

  it('calls onPromptChange when textarea edited', () => {
    render(<PromptSection {...defaultProps} promptExpanded={true} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New prompt' } })
    expect(defaultProps.onPromptChange).toHaveBeenCalledWith('New prompt')
  })

  it('shows reset and save-as-default buttons when expanded', () => {
    render(<PromptSection {...defaultProps} promptExpanded={true} />)
    expect(screen.getByText('Reset to default')).toBeTruthy()
    expect(screen.getByText('Use as default')).toBeTruthy()
  })

  it('calls onResetPrompt when reset button clicked', () => {
    render(<PromptSection {...defaultProps} promptExpanded={true} />)
    fireEvent.click(screen.getByText('Reset to default'))
    expect(defaultProps.onResetPrompt).toHaveBeenCalledOnce()
  })

  it('calls onSaveAsDefault when save button clicked', () => {
    render(<PromptSection {...defaultProps} promptExpanded={true} />)
    fireEvent.click(screen.getByText('Use as default'))
    expect(defaultProps.onSaveAsDefault).toHaveBeenCalledOnce()
  })

  it('disables textarea when submitting', () => {
    render(<PromptSection {...defaultProps} promptExpanded={true} submitting={true} />)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('shows "Saving..." when saving default', () => {
    render(<PromptSection {...defaultProps} promptExpanded={true} savingDefault={true} />)
    expect(screen.getByText('Saving…')).toBeTruthy()
  })

  it('truncates long previews in collapsed mode', () => {
    const longPrompt = 'x'.repeat(250)
    render(<PromptSection {...defaultProps} prompt={longPrompt} />)
    const preview = screen.getByText(/^x+\.\.\.$/);
    expect(preview.textContent!.endsWith('...')).toBe(true)
  })
})
