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
})
