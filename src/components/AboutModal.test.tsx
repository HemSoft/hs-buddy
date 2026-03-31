import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AboutModal } from './AboutModal'

beforeEach(() => {
  Object.defineProperty(window, 'shell', {
    value: { openExternal: vi.fn() },
    writable: true,
    configurable: true,
  })
})

describe('AboutModal', () => {
  it('renders app name and version', () => {
    render(<AboutModal onClose={vi.fn()} />)
    expect(screen.getByText('Buddy')).toBeTruthy()
    expect(screen.getByText(/Version/)).toBeTruthy()
  })

  it('renders tagline and description', () => {
    render(<AboutModal onClose={vi.fn()} />)
    expect(screen.getByText('Your Universal Productivity Companion')).toBeTruthy()
    expect(screen.getByText(/desktop app for managing GitHub PRs/)).toBeTruthy()
  })

  it('renders tech stack info', () => {
    render(<AboutModal onClose={vi.fn()} />)
    expect(screen.getByText('Electron 30')).toBeTruthy()
    expect(screen.getByText('React 18')).toBeTruthy()
    expect(screen.getByText('Vite + Bun')).toBeTruthy()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<AboutModal onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when overlay clicked', () => {
    const onClose = vi.fn()
    render(<AboutModal onClose={onClose} />)
    const overlay = screen.getByRole('presentation')
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when modal content clicked', () => {
    const onClose = vi.fn()
    render(<AboutModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Buddy'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('opens GitHub link when button clicked', () => {
    render(<AboutModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('View on GitHub'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/relias-engineering/hs-buddy'
    )
  })

  it('renders Made with heart footer', () => {
    render(<AboutModal onClose={vi.fn()} />)
    expect(screen.getByText('by HemSoft Developments')).toBeTruthy()
  })
})
