import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppearanceColorsSection } from './AppearanceColorsSection'

vi.mock('./AppearanceColorPicker', () => ({
  ColorPicker: ({ id, label }: { id: string; label: string }) => (
    <div data-testid={`color-picker-${id}`}>{label}</div>
  ),
}))

describe('AppearanceColorsSection', () => {
  const defaultProps = {
    brandColors: [
      { id: 'primary', label: 'Primary', cssVar: '--brand-primary', value: '#4a90d9', onChange: vi.fn() },
      { id: 'accent', label: 'Accent', cssVar: '--brand-accent', value: '#e74c3c', onChange: vi.fn() },
    ],
    backgroundColors: [
      { id: 'bg-main', label: 'Main', cssVar: '--bg-main', value: '#1e1e2e', onChange: vi.fn() },
    ],
    statusBarColors: [
      { id: 'status-bg', label: 'Background', cssVar: '--status-bg', value: '#333', onChange: vi.fn() },
    ],
    onReset: vi.fn(),
  }

  it('renders Colors heading', () => {
    render(<AppearanceColorsSection {...defaultProps} />)
    expect(screen.getByText('Colors')).toBeTruthy()
  })

  it('renders brand color pickers', () => {
    render(<AppearanceColorsSection {...defaultProps} />)
    expect(screen.getByText('Primary')).toBeTruthy()
    expect(screen.getByText('Accent')).toBeTruthy()
  })

  it('renders background color group', () => {
    render(<AppearanceColorsSection {...defaultProps} />)
    expect(screen.getByText('Backgrounds')).toBeTruthy()
    expect(screen.getByText('Main')).toBeTruthy()
  })

  it('renders status bar color group', () => {
    render(<AppearanceColorsSection {...defaultProps} />)
    expect(screen.getByText('Status Bar')).toBeTruthy()
  })

  it('calls onReset when reset button clicked', () => {
    render(<AppearanceColorsSection {...defaultProps} />)
    fireEvent.click(screen.getByText('Reset'))
    expect(defaultProps.onReset).toHaveBeenCalledOnce()
  })
})
