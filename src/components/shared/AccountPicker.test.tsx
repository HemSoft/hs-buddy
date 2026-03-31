import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AccountPicker } from './AccountPicker'

vi.mock('../../hooks/useConfig', () => ({
  useCopilotSettings: () => ({
    setGhAccount: vi.fn().mockResolvedValue(undefined),
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
})
