import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ColorPicker } from './AppearanceColorPicker'

const DEFAULT_PROPS = {
  id: 'accent-color',
  label: 'Accent',
  hint: 'Primary accent color',
  value: '#ff5500',
  onChange: vi.fn(),
}

function renderColorPicker(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const onChange = overrides.onChange ?? vi.fn()
  const view = render(<ColorPicker {...DEFAULT_PROPS} {...overrides} onChange={onChange} />)

  const colorInput = view.container.querySelector('input[type="color"]')
  const textInput = view.container.querySelector('input[type="text"]')

  if (!(colorInput instanceof HTMLInputElement)) {
    throw new Error('Expected color input to render')
  }

  if (!(textInput instanceof HTMLInputElement)) {
    throw new Error('Expected text input to render')
  }

  return { ...view, colorInput, textInput, onChange }
}

describe('ColorPicker', () => {
  it('renders the label, hint, and current values for both inputs', () => {
    const { colorInput, textInput } = renderColorPicker()

    expect(screen.getByText('Accent')).toBeTruthy()
    expect(screen.getByText('Primary accent color')).toBeTruthy()
    expect(colorInput.value).toBe('#ff5500')
    expect(colorInput.id).toBe('accent-color')
    expect(textInput.value).toBe('#ff5500')
    expect(textInput.getAttribute('placeholder')).toBe('#ff5500')
  })

  it('associates the label with the color input', () => {
    const { colorInput } = renderColorPicker()

    expect(screen.getByText('Accent').tagName).toBe('LABEL')
    expect(screen.getByLabelText('Accent')).toBe(colorInput)
  })

  it('calls onChange when the color swatch changes', () => {
    const { colorInput, onChange } = renderColorPicker()

    fireEvent.change(colorInput, { target: { value: '#00aaff' } })

    expect(onChange).toHaveBeenCalledWith('#00aaff')
  })

  it.each(['#aabbcc', '#AABBCC', '#aAbBcC'])(
    'accepts valid six-digit hex values from the text input: %s',
    value => {
      const { textInput, onChange } = renderColorPicker()

      fireEvent.change(textInput, { target: { value } })

      expect(onChange).toHaveBeenCalledWith(value)
    }
  )

  it.each(['#abc', 'aabbcc', '#gghhii', ''])(
    'rejects invalid hex values from the text input: %s',
    value => {
      const { textInput, onChange } = renderColorPicker()

      fireEvent.change(textInput, { target: { value } })

      expect(onChange).not.toHaveBeenCalled()
    }
  )
})
