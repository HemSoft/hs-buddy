import type { ComponentProps } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineDropdown, type DropdownOption } from './InlineDropdown'

const DEFAULT_OPTIONS: DropdownOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Charlie' },
]

function renderDropdown(props: Partial<ComponentProps<typeof InlineDropdown>> = {}) {
  const onChange = vi.fn()
  const view = render(
    <InlineDropdown value="a" options={DEFAULT_OPTIONS} onChange={onChange} {...props} />
  )

  return { ...view, onChange }
}

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InlineDropdown', () => {
  it('renders the selected label and optional decorations', () => {
    const { container } = renderDropdown({
      value: 'b',
      className: 'custom-class',
      title: 'Choose an option',
      icon: <span data-testid="dropdown-icon">icon</span>,
    })

    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByTestId('dropdown-icon')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('custom-class')
    expect(container.firstElementChild).toHaveAttribute('title', 'Choose an option')
  })

  it('falls back to the provided placeholder when the value is missing', () => {
    renderDropdown({ value: 'missing', placeholder: 'Pick one' })

    expect(screen.getByText('Pick one')).toBeInTheDocument()
  })

  it('opens and closes from the trigger button while keeping combobox ARIA state in sync', async () => {
    const user = userEvent.setup()
    renderDropdown()

    const combobox = screen.getByRole('combobox')
    const button = screen.getByRole('button')

    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    expect(combobox).not.toHaveAttribute('aria-controls')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.click(button)

    expect(combobox).toHaveAttribute('aria-expanded', 'true')
    expect(combobox).toHaveAttribute('aria-controls')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)

    await user.click(button)

    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes when clicking outside the dropdown', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <InlineDropdown value="a" options={DEFAULT_OPTIONS} onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'Alpha' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('marks the selected option and renders hints and menu positioning classes', async () => {
    const user = userEvent.setup()
    const options: DropdownOption[] = [
      { value: 'a', label: 'Alpha', hint: 'First option' },
      { value: 'b', label: 'Beta' },
    ]
    const { container } = renderDropdown({
      value: 'a',
      options,
      align: 'right',
      openUpward: true,
    })

    await user.click(screen.getByRole('button'))

    const [selectedOption, otherOption] = screen.getAllByRole('option')
    expect(selectedOption).toHaveAttribute('aria-selected', 'true')
    expect(otherOption).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('First option')).toBeInTheDocument()
    expect(container.querySelector('.idropdown-menu-right')).toBeTruthy()
    expect(container.querySelector('.idropdown-menu-up')).toBeTruthy()
  })

  it('selects an option on click and closes the menu', async () => {
    const user = userEvent.setup()
    const { onChange } = renderDropdown()

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('option', { name: /charlie/i }))

    expect(onChange).toHaveBeenCalledWith('c')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('supports keyboard opening, navigation, selection, and escape', async () => {
    const user = userEvent.setup()
    const { onChange, container } = renderDropdown()
    const combobox = screen.getByRole('combobox')

    combobox.focus()
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(container.querySelector('.idropdown-item-focused')).toHaveTextContent('Alpha')

    await user.keyboard('{ArrowDown}')
    expect(container.querySelector('.idropdown-item-focused')).toHaveTextContent('Beta')

    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('keeps keyboard focus clamped within enabled options', async () => {
    const user = userEvent.setup()
    const { container } = renderDropdown({ value: 'c' })
    const combobox = screen.getByRole('combobox')

    combobox.focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')

    expect(container.querySelectorAll('.idropdown-item-focused')).toHaveLength(1)
    expect(container.querySelector('.idropdown-item-focused')).toHaveTextContent('Charlie')

    await user.keyboard('{ArrowUp}')
    expect(container.querySelector('.idropdown-item-focused')).toHaveTextContent('Beta')
  })

  it('updates the focused enabled option on hover and focus events', async () => {
    const user = userEvent.setup()
    const { container } = renderDropdown()

    await user.click(screen.getByRole('button'))

    const options = screen.getAllByRole('option')
    await user.hover(options[2])
    expect(container.querySelector('.idropdown-item-focused')).toHaveTextContent('Charlie')

    fireEvent.focus(options[1])
    expect(container.querySelector('.idropdown-item-focused')).toHaveTextContent('Beta')
  })

  it('prevents interaction when the dropdown is disabled', async () => {
    const user = userEvent.setup()
    const { container, onChange } = renderDropdown({ disabled: true })

    const combobox = screen.getByRole('combobox')
    expect(container.firstElementChild).toHaveClass('idropdown-disabled')
    expect(combobox).toHaveAttribute('tabindex', '-1')

    await user.click(screen.getByRole('button'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    combobox.focus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not allow selecting disabled options', async () => {
    const user = userEvent.setup()
    const options: DropdownOption[] = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta', disabled: true },
      { value: 'c', label: 'Charlie' },
    ]
    const { onChange } = renderDropdown({ options })

    await user.click(screen.getByRole('button'))

    const disabledOption = screen.getByRole('option', { name: /beta/i })
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true')

    await user.click(disabledOption)

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('selects the focused option when pressing space on the combobox', async () => {
    const user = userEvent.setup()
    const { onChange } = renderDropdown()
    const combobox = screen.getByRole('combobox')

    combobox.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{ }')

    expect(onChange).toHaveBeenCalledWith('b')
  })
})
