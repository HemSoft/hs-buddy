import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ModelPicker } from './ModelPicker'

const mocks = vi.hoisted(() => ({
  listModels: vi.fn(),
  setModel: vi.fn(),
  inlineDropdown: vi.fn(),
}))

vi.mock('../../hooks/useConfig', () => ({
  useCopilotSettings: () => ({
    setModel: mocks.setModel,
  }),
}))

vi.mock('../InlineDropdown', () => ({
  InlineDropdown: (props: {
    value: string
    options: { value: string; label: string; hint?: string }[]
    onChange: (value: string) => void
    placeholder?: string
  }) => {
    mocks.inlineDropdown(props)
    return (
      <button data-testid="inline-dropdown" onClick={() => props.onChange('clicked-model')}>
        {props.value || props.placeholder}
      </button>
    )
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setModel.mockResolvedValue(undefined)
  Object.defineProperty(window, 'copilot', {
    value: {
      listModels: mocks.listModels,
    },
    writable: true,
    configurable: true,
  })
})

describe('ModelPicker', () => {
  it('shows an inline loading state while models are being fetched', async () => {
    const pending =
      deferred<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }[]>()
    mocks.listModels.mockReturnValueOnce(pending.promise)

    render(<ModelPicker value="" onChange={vi.fn()} />)

    expect(await screen.findByText('Loading...')).toBeInTheDocument()

    pending.resolve([])
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(1))
  })

  it('renders enabled and disabled model groups in select mode', async () => {
    mocks.listModels.mockResolvedValueOnce([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
      { id: 'gpt-5.4', name: 'GPT-5.4', isDisabled: false, billingMultiplier: 2 },
      { id: 'gemini-2.5', name: 'Gemini 2.5', isDisabled: true, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="claude-sonnet-4.5" onChange={vi.fn()} variant="select" />)

    expect(await screen.findByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Claude Sonnet' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'GPT-5.4 · 2x' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gemini 2.5 (disabled)' })).toBeDisabled()
  })

  it('persists a changed model selection in select mode', async () => {
    const onChange = vi.fn()
    mocks.listModels.mockResolvedValueOnce([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
      { id: 'gpt-5.4', name: 'GPT-5.4', isDisabled: false, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="claude-sonnet-4.5" onChange={onChange} persist variant="select" />)

    const select = await screen.findByRole('combobox')
    fireEvent.change(select, { target: { value: 'gpt-5.4' } })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('gpt-5.4'))
    expect(mocks.setModel).toHaveBeenCalledWith('gpt-5.4')
  })

  it('falls back to the first enabled model when the current value is unknown', async () => {
    const onChange = vi.fn()
    mocks.listModels.mockResolvedValueOnce([
      { id: 'gpt-5.4', name: 'GPT-5.4', isDisabled: true, billingMultiplier: 1 },
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="missing-model" onChange={onChange} persist />)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('claude-sonnet-4.5'))
    expect(mocks.setModel).toHaveBeenCalledWith('claude-sonnet-4.5')
  })

  it('shows fetch errors in select mode', async () => {
    mocks.listModels.mockResolvedValueOnce({ error: 'SDK unavailable' })

    render(<ModelPicker value="" onChange={vi.fn()} variant="select" />)

    expect(await screen.findByText('Failed to fetch models: SDK unavailable')).toBeInTheDocument()
  })

  it('renders a refresh action when no models are loaded in select mode', async () => {
    mocks.listModels.mockResolvedValue([])

    render(<ModelPicker value="" onChange={vi.fn()} variant="select" showRefresh />)

    expect(await screen.findByText('No models loaded.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(2))
  })

  it('passes only enabled models to the inline dropdown', async () => {
    const onChange = vi.fn()
    mocks.listModels.mockResolvedValueOnce([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
      { id: 'gpt-5.4', name: 'GPT-5.4', isDisabled: false, billingMultiplier: 2 },
      { id: 'gemini-2.5', name: 'Gemini 2.5', isDisabled: true, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="claude-sonnet-4.5" onChange={onChange} />)

    await waitFor(() => expect(mocks.inlineDropdown).toHaveBeenCalled())
    const [lastProps] = mocks.inlineDropdown.mock.lastCall ?? []
    expect(lastProps).toEqual(
      expect.objectContaining({
        options: [
          { value: 'claude-sonnet-4.5', label: 'Claude Sonnet', hint: undefined },
          { value: 'gpt-5.4', label: 'GPT-5.4', hint: '2x' },
        ],
      })
    )

    fireEvent.click(screen.getByTestId('inline-dropdown'))
    expect(onChange).toHaveBeenCalledWith('clicked-model')
  })

  it('shows select-variant loading state', async () => {
    const pending =
      deferred<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }[]>()
    mocks.listModels.mockReturnValueOnce(pending.promise)

    render(<ModelPicker value="" onChange={vi.fn()} variant="select" />)

    expect(await screen.findByText('Fetching available models...')).toBeInTheDocument()

    pending.resolve([])
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(1))
  })

  it('handles fetchModels exception in catch path', async () => {
    mocks.listModels.mockRejectedValueOnce(new Error('Network failure'))

    render(<ModelPicker value="" onChange={vi.fn()} variant="select" />)

    expect(await screen.findByText('Failed to fetch models: Network failure')).toBeInTheDocument()
  })

  it('uses fallback options when no enabled models exist for inline variant', async () => {
    mocks.listModels.mockResolvedValueOnce([
      { id: 'gemini-2.5', name: 'Gemini 2.5', isDisabled: true, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="my-custom-model" onChange={vi.fn()} />)

    await waitFor(() => expect(mocks.inlineDropdown).toHaveBeenCalled())
    const [lastProps] = mocks.inlineDropdown.mock.lastCall ?? []
    // When no enabled models, falls back to [{ value, label: value }]
    expect(lastProps.options).toEqual([{ value: 'my-custom-model', label: 'my-custom-model' }])
  })

  it('does not persist when persist prop is false (inline variant)', async () => {
    const onChange = vi.fn()
    mocks.listModels.mockResolvedValueOnce([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="claude-sonnet-4.5" onChange={onChange} persist={false} />)

    await waitFor(() => expect(mocks.inlineDropdown).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('inline-dropdown'))
    expect(onChange).toHaveBeenCalledWith('clicked-model')

    await waitFor(() => expect(mocks.setModel).not.toHaveBeenCalled())
  })

  it('shows refresh button in select mode when models are loaded', async () => {
    mocks.listModels.mockResolvedValue([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
    ])

    render(
      <ModelPicker value="claude-sonnet-4.5" onChange={vi.fn()} variant="select" showRefresh />
    )

    const select = await screen.findByRole('combobox')
    expect(select).toBeInTheDocument()

    const refreshBtn = screen.getByRole('button', { name: /refresh/i })
    expect(refreshBtn).toBeInTheDocument()

    fireEvent.click(refreshBtn)
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(2))
  })

  it('handles unexpected non-array non-error result from listModels', async () => {
    // listModels returns null (neither error object nor array)
    mocks.listModels.mockResolvedValueOnce(null)

    render(<ModelPicker value="" onChange={vi.fn()} variant="select" />)

    // No error, no models loaded — should show "No models loaded."
    expect(await screen.findByText('No models loaded.')).toBeInTheDocument()
  })

  it('re-fetches models when ghAccount prop changes', async () => {
    mocks.listModels.mockResolvedValue([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
    ])

    const { rerender } = render(<ModelPicker value="claude-sonnet-4.5" onChange={vi.fn()} />)
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(1))

    rerender(<ModelPicker value="claude-sonnet-4.5" onChange={vi.fn()} ghAccount="other-account" />)
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(2))
    expect(mocks.listModels).toHaveBeenLastCalledWith('other-account')
  })

  it('renders select empty state without refresh button when showRefresh is false', async () => {
    mocks.listModels.mockResolvedValue([])

    render(<ModelPicker value="" onChange={vi.fn()} variant="select" showRefresh={false} />)

    expect(await screen.findByText('No models loaded.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument()
  })

  it('does not fall back when value is empty string', async () => {
    const onChange = vi.fn()
    mocks.listModels.mockResolvedValueOnce([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="" onChange={onChange} />)

    await waitFor(() => expect(mocks.inlineDropdown).toHaveBeenCalled())
    // value === '' skips the unknown-model fallback
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not fall back when all models are disabled', async () => {
    const onChange = vi.fn()
    mocks.listModels.mockResolvedValueOnce([
      { id: 'gemini-2.5', name: 'Gemini 2.5', isDisabled: true, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="unknown-model" onChange={onChange} />)

    await waitFor(() => expect(mocks.inlineDropdown).toHaveBeenCalled())
    // No enabled model found → no fallback
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores stale fetch responses when a newer fetch is in progress', async () => {
    const firstFetch =
      deferred<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }[]>()
    const secondFetch =
      deferred<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }[]>()
    mocks.listModels
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise)

    const { rerender } = render(<ModelPicker value="" onChange={vi.fn()} />)

    // Trigger a second fetch by changing account
    rerender(<ModelPicker value="" onChange={vi.fn()} ghAccount="new-account" />)
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(2))

    // Resolve second fetch first
    secondFetch.resolve([
      { id: 'gpt-5.4', name: 'GPT-5.4', isDisabled: false, billingMultiplier: 1 },
    ])
    await waitFor(() => expect(mocks.inlineDropdown).toHaveBeenCalled())

    // Now resolve the stale first fetch — it should be ignored
    firstFetch.resolve([
      { id: 'old-model', name: 'Old Model', isDisabled: false, billingMultiplier: 1 },
    ])

    // The dropdown should still show the second fetch result
    await waitFor(() => {
      const [lastProps] = mocks.inlineDropdown.mock.lastCall ?? []
      expect(lastProps.options[0].value).toBe('gpt-5.4')
    })
  })

  it('falls back to the first enabled model without persisting when persist is false', async () => {
    const onChange = vi.fn()
    mocks.listModels.mockResolvedValueOnce([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
    ])

    render(<ModelPicker value="missing-model" onChange={onChange} persist={false} />)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('claude-sonnet-4.5'))
    // persist=false so setModel should NOT be called
    expect(mocks.setModel).not.toHaveBeenCalled()
  })

  it('does not re-fetch when re-rendered with the same ghAccount', async () => {
    mocks.listModels.mockResolvedValue([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
    ])

    const { rerender } = render(
      <ModelPicker value="claude-sonnet-4.5" onChange={vi.fn()} ghAccount="acme" />
    )
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(1))

    // Re-render with same account — should not trigger another fetch
    rerender(<ModelPicker value="claude-sonnet-4.5" onChange={vi.fn()} ghAccount="acme" />)
    // Give time for any potential effect to run
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(1))
  })

  it('ignores stale error responses when a newer fetch is in progress', async () => {
    const firstFetch = deferred<never>()
    const secondFetch =
      deferred<{ id: string; name: string; isDisabled: boolean; billingMultiplier: number }[]>()
    mocks.listModels
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise)

    const { rerender } = render(<ModelPicker value="" onChange={vi.fn()} variant="select" />)

    // Trigger second fetch by changing account
    rerender(<ModelPicker value="" onChange={vi.fn()} variant="select" ghAccount="new-acct" />)
    await waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(2))

    // Resolve second fetch
    secondFetch.resolve([
      { id: 'gpt-5.4', name: 'GPT-5.4', isDisabled: false, billingMultiplier: 1 },
    ])
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    // First fetch rejects (stale) — should be ignored, not show error
    firstFetch.reject(new Error('Stale error'))
    // Wait a tick to ensure rejection is processed
    await new Promise(r => setTimeout(r, 10))
    expect(screen.queryByText(/Stale error/)).not.toBeInTheDocument()
  })

  it('passes disabled, title, className, and align props to inline dropdown', async () => {
    mocks.listModels.mockResolvedValueOnce([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet', isDisabled: false, billingMultiplier: 1 },
    ])

    render(
      <ModelPicker
        value="claude-sonnet-4.5"
        onChange={vi.fn()}
        disabled
        title="Pick a model"
        className="custom-cls"
        align="right"
      />
    )

    await waitFor(() => expect(mocks.inlineDropdown).toHaveBeenCalled())
    const [lastProps] = mocks.inlineDropdown.mock.lastCall ?? []
    expect(lastProps).toEqual(
      expect.objectContaining({
        disabled: true,
        title: 'Pick a model',
        className: 'copilot-model-dropdown custom-cls',
        align: 'right',
      })
    )
  })
})
