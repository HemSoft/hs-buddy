import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AiConfigSection } from './AiConfigSection'

vi.mock('../../shared/AccountPicker', () => ({
  AccountPicker: ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) => (
    <select data-testid={id} value={value} onChange={e => onChange(e.target.value)}>
      <option value="user1">user1</option>
      <option value="user2">user2</option>
    </select>
  ),
}))

vi.mock('../../shared/ModelPicker', () => ({
  ModelPicker: ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) => (
    <select data-testid={id} value={value} onChange={e => onChange(e.target.value)}>
      <option value="gpt-4">gpt-4</option>
      <option value="claude">claude</option>
    </select>
  ),
}))

vi.mock('../../shared/RepoPicker', () => ({
  RepoPicker: ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) => (
    <select data-testid={id} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">None</option>
      <option value="acme/web">acme/web</option>
    </select>
  ),
}))

describe('AiConfigSection', () => {
  const defaultProps = {
    prompt: 'Review this code',
    ghAccount: 'user1',
    model: 'gpt-4',
    targetRepo: '',
    onPromptChange: vi.fn(),
    onGhAccountChange: vi.fn(),
    onModelChange: vi.fn(),
    onTargetRepoChange: vi.fn(),
  }

  it('renders prompt textarea', () => {
    render(<AiConfigSection {...defaultProps} />)
    const textarea = screen.getByLabelText('Prompt *') as HTMLTextAreaElement
    expect(textarea.value).toBe('Review this code')
  })

  it('renders account picker', () => {
    render(<AiConfigSection {...defaultProps} />)
    expect(screen.getByTestId('job-gh-account')).toBeTruthy()
  })

  it('renders model picker', () => {
    render(<AiConfigSection {...defaultProps} />)
    expect(screen.getByTestId('job-model')).toBeTruthy()
  })

  it('renders repo picker', () => {
    render(<AiConfigSection {...defaultProps} />)
    expect(screen.getByTestId('job-target-repo')).toBeTruthy()
  })

  it('calls onPromptChange when prompt edited', () => {
    render(<AiConfigSection {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('Prompt *'), { target: { value: 'New prompt' } })
    expect(defaultProps.onPromptChange).toHaveBeenCalledWith('New prompt')
  })
})
