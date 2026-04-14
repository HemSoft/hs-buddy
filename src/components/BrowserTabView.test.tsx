import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => {
    localStorage.clear()
  })

  it('resets the displayed url when the url prop changes after navigation', async () => {
    const { container, rerender } = render(<BrowserTabView url="https://initial.example" />)
    const webview = container.querySelector('webview')

    expect(webview).not.toBeNull()
    expect(webview).toHaveAttribute('partition', 'persist:browser')
    expect(webview).toHaveAttribute('allowpopups', 'true')

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

  it('shows zoom in and zoom out buttons', () => {
    render(<BrowserTabView url="https://example.com" />)
    expect(screen.getByTitle(/Zoom in/)).toBeInTheDocument()
    expect(screen.getByTitle(/Zoom out/)).toBeInTheDocument()
  })

  it('shows navigation buttons', () => {
    render(<BrowserTabView url="https://example.com" />)
    expect(screen.getByTitle('Back')).toBeInTheDocument()
    expect(screen.getByTitle('Forward')).toBeInTheDocument()
  })

  it('shows Stop button while loading, Reload when not loading', async () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    // Initially loading
    expect(screen.getByTitle('Stop')).toBeInTheDocument()

    // Simulate stop loading
    const webview = container.querySelector('webview')!
    act(() => {
      webview.dispatchEvent(new Event('did-stop-loading'))
    })
    await waitFor(() => {
      expect(screen.getByTitle('Reload')).toBeInTheDocument()
    })
  })

  it('persists zoom level to localStorage on zoom in', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const webview = container.querySelector('webview')!
    // Mock setZoomLevel
    ;(webview as unknown as Record<string, unknown>).setZoomLevel = vi.fn()

    fireEvent.click(screen.getByTitle(/Zoom in/))
    expect(localStorage.getItem('browser-zoom-level')).toBe('0.5')
  })

  it('persists zoom level to localStorage on zoom out', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const webview = container.querySelector('webview')!
    ;(webview as unknown as Record<string, unknown>).setZoomLevel = vi.fn()

    fireEvent.click(screen.getByTitle(/Zoom out/))
    expect(localStorage.getItem('browser-zoom-level')).toBe('-0.5')
  })

  it('restores zoom level from localStorage on mount', () => {
    localStorage.setItem('browser-zoom-level', '2')
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const webview = container.querySelector('webview')!
    const mockSetZoom = vi.fn()
    ;(webview as unknown as Record<string, unknown>).setZoomLevel = mockSetZoom

    // Simulate stop loading, which should restore zoom
    act(() => {
      webview.dispatchEvent(new Event('did-stop-loading'))
    })
    expect(mockSetZoom).toHaveBeenCalledWith(2)
  })

  it('calls onTitleChange when page title updates', async () => {
    const onTitleChange = vi.fn()
    const { container } = render(
      <BrowserTabView url="https://example.com" onTitleChange={onTitleChange} />
    )
    const webview = container.querySelector('webview')!

    const titleEvent = new Event('page-title-updated')
    Object.defineProperty(titleEvent, 'title', { value: 'My Page Title' })
    act(() => {
      webview.dispatchEvent(titleEvent)
    })

    await waitFor(() => {
      expect(onTitleChange).toHaveBeenCalledWith('My Page Title')
    })
  })

  it('handles keyboard shortcuts for zoom (Alt+= and Alt+-)', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const webview = container.querySelector('webview')!
    ;(webview as unknown as Record<string, unknown>).setZoomLevel = vi.fn()

    // Alt+= to zoom in
    fireEvent.keyDown(window, { key: '=', altKey: true })
    expect(localStorage.getItem('browser-zoom-level')).toBe('0.5')

    // Alt+- to zoom out
    fireEvent.keyDown(window, { key: '-', altKey: true })
    expect(localStorage.getItem('browser-zoom-level')).toBe('0')
  })

  it('shows loading spinner while loading', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    expect(container.querySelector('.browser-tab-spinner')).toBeTruthy()
  })

  it('disables back/forward buttons while loading', () => {
    render(<BrowserTabView url="https://example.com" />)
    expect(screen.getByTitle('Back')).toBeDisabled()
    expect(screen.getByTitle('Forward')).toBeDisabled()
  })
})
