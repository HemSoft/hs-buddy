import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserTabView } from './BrowserTabView'

describe('BrowserTabView', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'shell', {
      value: { openExternal: vi.fn() },
      writable: true,
      configurable: true,
    })
    localStorage.clear()
  })

  it('resets the displayed url when the url prop changes after navigation', async () => {
    const { container, rerender } = render(<BrowserTabView url="https://initial.example" />)
    const webview = container.querySelector('webview')

    expect(webview).not.toBeNull()

    const navigateEvent = new Event('did-navigate')
    Object.defineProperty(navigateEvent, 'url', {
      value: 'https://navigated.example',
    })
    act(() => {
      webview!.dispatchEvent(navigateEvent)
    })

    await waitFor(() => {
      expect(screen.getByText('https://navigated.example')).toBeInTheDocument()
    })

    rerender(<BrowserTabView url="https://updated.example" />)

    await waitFor(() => {
      expect(screen.getByText('https://updated.example')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTitle('Open in external browser'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://updated.example')
  })
})
