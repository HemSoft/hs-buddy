import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppearanceThemeSection } from './AppearanceThemeSection'

type AppearanceThemeSectionProps = ComponentProps<typeof AppearanceThemeSection>

const DEFAULT_PROPS: AppearanceThemeSectionProps = {
  theme: 'dark' as const,
  onThemeChange: vi.fn().mockResolvedValue(undefined),
}

function renderThemeSection(overrides: Partial<AppearanceThemeSectionProps> = {}) {
  const onThemeChange = overrides.onThemeChange ?? vi.fn().mockResolvedValue(undefined)

  return {
    ...render(<AppearanceThemeSection {...DEFAULT_PROPS} {...overrides} onThemeChange={onThemeChange} />),
    onThemeChange,
  }
}

describe('AppearanceThemeSection', () => {
  it('renders the section heading and both theme buttons', () => {
    renderThemeSection()

    expect(screen.getByRole('heading', { level: 3, name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
  })

  it('marks the dark option as selected when the dark theme is active', () => {
    renderThemeSection({ theme: 'dark' })

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveClass('theme-option', 'selected')
    expect(screen.getByRole('button', { name: 'Light' })).toHaveClass('theme-option')
    expect(screen.getByRole('button', { name: 'Light' })).not.toHaveClass('selected')
  })

  it('marks the light option as selected when the light theme is active', () => {
    renderThemeSection({ theme: 'light' })

    expect(screen.getByRole('button', { name: 'Light' })).toHaveClass('theme-option', 'selected')
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveClass('theme-option')
    expect(screen.getByRole('button', { name: 'Dark' })).not.toHaveClass('selected')
  })

  it('calls onThemeChange with dark when the dark button is clicked', () => {
    const { onThemeChange } = renderThemeSection({ theme: 'light' })

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))

    expect(onThemeChange).toHaveBeenCalledTimes(1)
    expect(onThemeChange).toHaveBeenCalledWith('dark')
  })

  it('calls onThemeChange with light when the light button is clicked', () => {
    const { onThemeChange } = renderThemeSection({ theme: 'dark' })

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))

    expect(onThemeChange).toHaveBeenCalledTimes(1)
    expect(onThemeChange).toHaveBeenCalledWith('light')
  })
})
