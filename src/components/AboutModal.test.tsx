import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { APP_VERSION } from '../constants/appVersion'
import { AboutModal } from './AboutModal'
import { axe } from '../test/axe-helper'

beforeEach(() => {
  Object.defineProperty(window, 'shell', {
    value: { openExternal: vi.fn() },
    writable: true,
    configurable: true,
  })
})

function AboutModalHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open About
      </button>
      {open && <AboutModal onClose={() => setOpen(false)} />}
    </>
  )
}

describe('AboutModal', () => {
  it('renders app name and version', () => {
    render(<AboutModal onClose={vi.fn()} />)
    expect(screen.getByText('Buddy')).toBeTruthy()
    expect(screen.getByText(`Version ${APP_VERSION}`)).toBeTruthy()
  })

  it('exposes a labeled modal dialog and moves focus inside', () => {
    render(<AboutModal onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Buddy' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
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
    fireEvent.click(screen.getByRole('button', { name: 'Close About dialog' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when modal content clicked', () => {
    const onClose = vi.fn()
    render(<AboutModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Buddy'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('AboutModal focus management', () => {
  it('focuses the dialog if it opens without a focusable control', () => {
    const querySelectorAll = vi
      .spyOn(HTMLElement.prototype, 'querySelectorAll')
      .mockReturnValueOnce([] as unknown as NodeListOf<Element>)

    render(<AboutModal onClose={vi.fn()} />)
    querySelectorAll.mockRestore()

    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('closes with Escape and restores focus to the opener', () => {
    render(<AboutModalHarness />)
    const opener = screen.getByRole('button', { name: 'Open About' })
    opener.focus()
    fireEvent.click(opener)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('wraps focus in both directions at the dialog boundaries', () => {
    render(<AboutModal onClose={vi.fn()} />)
    const closeButton = screen.getByRole('button', { name: 'Close' })
    const githubButton = screen.getByRole('button', { name: 'View on GitHub' })

    closeButton.focus()
    const backwardEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    closeButton.dispatchEvent(backwardEvent)
    expect(backwardEvent.defaultPrevented).toBe(true)
    expect(githubButton).toHaveFocus()

    const forwardEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    githubButton.dispatchEvent(forwardEvent)
    expect(forwardEvent.defaultPrevented).toBe(true)
    expect(closeButton).toHaveFocus()
  })

  it('moves focus back inside if an outside control receives focus', () => {
    render(
      <>
        <button type="button">Outside</button>
        <AboutModal onClose={vi.fn()} />
      </>
    )
    const outsideButton = screen.getByRole('button', { name: 'Outside' })

    outsideButton.focus()

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('focuses the dialog when no enabled controls remain', () => {
    render(<AboutModal onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    screen.getByRole('button', { name: 'Close' }).setAttribute('disabled', '')
    screen.getByRole('button', { name: 'View on GitHub' }).setAttribute('disabled', '')

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    dialog.dispatchEvent(tabEvent)

    expect(tabEvent.defaultPrevented).toBe(true)
    expect(dialog).toHaveFocus()
  })
})

describe('AboutModal links and accessibility', () => {
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

  it('has no accessibility violations', async () => {
    const { container } = render(<AboutModal onClose={vi.fn()} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
