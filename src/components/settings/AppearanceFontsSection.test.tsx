import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppearanceFontsSection } from './AppearanceFontsSection'

describe('AppearanceFontsSection', () => {
  const defaultProps = {
    fontFamily: 'Inter',
    monoFontFamily: 'Cascadia Code',
    uiFonts: ['Arial', 'Roboto', 'Helvetica'],
    monoFonts: ['Cascadia Code', 'Consolas', 'Fira Code', 'JetBrains Mono'],
    fontsLoading: false,
    onFontFamilyChange: vi.fn(),
    onMonoFontFamilyChange: vi.fn(),
  }

  it('renders fonts section heading', () => {
    render(<AppearanceFontsSection {...defaultProps} />)
    expect(screen.getByText('Fonts')).toBeTruthy()
  })

  it('renders UI font select with current value', () => {
    render(<AppearanceFontsSection {...defaultProps} />)
    const select = screen.getByLabelText('UI Font') as HTMLSelectElement
    expect(select.value).toBe('Inter')
  })

  it('renders mono font select with current value', () => {
    render(<AppearanceFontsSection {...defaultProps} />)
    const select = screen.getByLabelText('Monospace Font') as HTMLSelectElement
    expect(select.value).toBe('Cascadia Code')
  })

  it('shows custom UI fonts in dropdown', () => {
    render(<AppearanceFontsSection {...defaultProps} />)
    expect(screen.getByText('Arial')).toBeTruthy()
    expect(screen.getByText('Roboto')).toBeTruthy()
  })

  it('shows custom mono fonts in dropdown', () => {
    render(<AppearanceFontsSection {...defaultProps} />)
    expect(screen.getByText('Fira Code')).toBeTruthy()
    expect(screen.getByText('JetBrains Mono')).toBeTruthy()
  })

  it('calls onFontFamilyChange when UI font changed', () => {
    render(<AppearanceFontsSection {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('UI Font'), { target: { value: 'Arial' } })
    expect(defaultProps.onFontFamilyChange).toHaveBeenCalledWith('Arial')
  })

  it('calls onMonoFontFamilyChange when mono font changed', () => {
    render(<AppearanceFontsSection {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('Monospace Font'), { target: { value: 'Fira Code' } })
    expect(defaultProps.onMonoFontFamilyChange).toHaveBeenCalledWith('Fira Code')
  })

  it('disables selects when loading', () => {
    render(<AppearanceFontsSection {...defaultProps} fontsLoading={true} />)
    expect((screen.getByLabelText('UI Font') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('Monospace Font') as HTMLSelectElement).disabled).toBe(true)
  })

  it('shows font preview text', () => {
    render(<AppearanceFontsSection {...defaultProps} />)
    expect(screen.getByText('The quick brown fox jumps over the lazy dog')).toBeTruthy()
    expect(screen.getByText('const hello = "world"; // 0123456789')).toBeTruthy()
  })
})
