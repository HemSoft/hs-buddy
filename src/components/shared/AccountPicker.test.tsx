import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AccountPicker } from './AccountPicker'

const { mockSetGhAccount } = vi.hoisted(() => ({
  mockSetGhAccount: vi.fn(),
}))

vi.mock('../../hooks/useConfig', () => ({
  useCopilotSettings: () => ({
    setGhAccount: mockSetGhAccount,
  }),
  useGitHubAccounts: () => ({
    uniqueUsernames: ['alice', 'bob'],
    accounts: [],
  }),
}))

vi.mock('../InlineDropdown', () => ({
  InlineDropdown: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
  }) => (
    <button data-testid="inline-dropdown" onClick={() => onChange('alice')}>
      {value || placeholder}
    </button>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSetGhAccount.mockResolvedValue(undefined)
  Object.defineProperty(window, 'ipcRenderer', {
    value: {
      invoke: vi.fn().mockResolvedValue('active-user'),
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    writable: true,
    configurable: true,
  })
})

describe('AccountPicker', () => {
  it('renders select variant with accounts', () => {
    render(<AccountPicker value="" onChange={vi.fn()} variant="select" />)
    const select = screen.getByRole('combobox')
    expect(select).toBeTruthy()
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
  })

  it('calls onChange when select value changes', () => {
    const onChange = vi.fn()
    render(<AccountPicker value="" onChange={onChange} variant="select" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'alice' } })
    expect(onChange).toHaveBeenCalledWith('alice')
  })

  it('renders inline variant', () => {
    render(<AccountPicker value="" onChange={vi.fn()} variant="inline" />)
    expect(screen.getByTestId('inline-dropdown')).toBeTruthy()
  })

  it('shows active CLI account when no value selected', () => {
    render(<AccountPicker value="" onChange={vi.fn()} variant="select" />)
    expect(screen.getByText(/Use active CLI account/)).toBeTruthy()
  })

  it('disables select when disabled', () => {
    render(<AccountPicker value="" onChange={vi.fn()} variant="select" disabled />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  })

  it('persists account selection when persist prop is true', () => {
    const onChange = vi.fn()
    render(<AccountPicker value="" onChange={onChange} variant="select" persist />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'alice' } })
    expect(mockSetGhAccount).toHaveBeenCalledWith('alice')
  })

  it('handles setGhAccount rejection gracefully', async () => {
    mockSetGhAccount.mockRejectedValueOnce(new Error('Persist failed'))
    const onChange = vi.fn()
    render(<AccountPicker value="" onChange={onChange} variant="select" persist />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'alice' } })
    expect(mockSetGhAccount).toHaveBeenCalledWith('alice')
    // Should not throw — error is caught by .catch(() => {})
  })

  it('re-detects CLI account when value is cleared', () => {
    const onChange = vi.fn()
    render(<AccountPicker value="alice" onChange={onChange} variant="select" />)
    expect(window.ipcRenderer.invoke).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
    expect(window.ipcRenderer.invoke).toHaveBeenCalledTimes(2)
    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('github:get-active-account')
  })
})
