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

  function stubWebviewMethods(webview: Element) {
    const wv = webview as Element & {
      goBack: ReturnType<typeof vi.fn>
      goForward: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      reload: ReturnType<typeof vi.fn>
      setZoomLevel: ReturnType<typeof vi.fn>
    }
    wv.goBack = vi.fn()
    wv.goForward = vi.fn()
    wv.stop = vi.fn()
    wv.reload = vi.fn()
    wv.setZoomLevel = vi.fn()
    return wv
  }

  it('calls onTitleChange when page-title-updated fires', () => {
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

    expect(onTitleChange).toHaveBeenCalledWith('My Page Title')
  })

  it('shows spinner while loading and clears after stop', async () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const webview = container.querySelector('webview')!
    stubWebviewMethods(webview)

    // Initial state is loading — spinner should be present
    expect(container.querySelector('.browser-tab-spinner')).not.toBeNull()

    act(() => {
      webview.dispatchEvent(new Event('did-stop-loading'))
    })

    await waitFor(() => {
      expect(container.querySelector('.browser-tab-spinner')).toBeNull()
    })

    act(() => {
      webview.dispatchEvent(new Event('did-start-loading'))
    })

    await waitFor(() => {
      expect(container.querySelector('.browser-tab-spinner')).not.toBeNull()
    })
  })

  it('zooms in when Zoom in button is clicked', async () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const wv = stubWebviewMethods(container.querySelector('webview')!)

    // Stop loading so buttons are enabled
    act(() => {
      wv.dispatchEvent(new Event('did-stop-loading'))
    })

    fireEvent.click(screen.getByTitle('Zoom in (Alt + =)'))

    expect(localStorage.getItem('browser-zoom-level')).toBe('0.5')
    expect(wv.setZoomLevel).toHaveBeenCalledWith(0.5)
  })

  it('zooms out when Zoom out button is clicked', async () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const wv = stubWebviewMethods(container.querySelector('webview')!)

    act(() => {
      wv.dispatchEvent(new Event('did-stop-loading'))
    })

    fireEvent.click(screen.getByTitle('Zoom out (Alt + -)'))

    expect(localStorage.getItem('browser-zoom-level')).toBe('-0.5')
    expect(wv.setZoomLevel).toHaveBeenCalledWith(-0.5)
  })

  it('zooms in on Alt+= keyboard shortcut', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const wv = stubWebviewMethods(container.querySelector('webview')!)

    fireEvent.keyDown(window, { key: '=', altKey: true })

    expect(localStorage.getItem('browser-zoom-level')).toBe('0.5')
    expect(wv.setZoomLevel).toHaveBeenCalledWith(0.5)
  })

  it('zooms out on Alt+- keyboard shortcut', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const wv = stubWebviewMethods(container.querySelector('webview')!)

    fireEvent.keyDown(window, { key: '-', altKey: true })

    expect(localStorage.getItem('browser-zoom-level')).toBe('-0.5')
    expect(wv.setZoomLevel).toHaveBeenCalledWith(-0.5)
  })

  it('dispatches app:tab-next on Ctrl+Tab in webview', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const webview = container.querySelector('webview')!

    const listener = vi.fn()
    window.addEventListener('app:tab-next', listener)

    const beforeInputEvent = new Event('before-input-event', { cancelable: true })
    Object.defineProperty(beforeInputEvent, 'input', {
      value: { type: 'keyDown', key: 'Tab', control: true, meta: false, shift: false },
    })
    act(() => {
      webview.dispatchEvent(beforeInputEvent)
    })

    expect(listener).toHaveBeenCalled()
    window.removeEventListener('app:tab-next', listener)
  })

  it('dispatches app:tab-prev on Ctrl+Shift+Tab in webview', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const webview = container.querySelector('webview')!

    const listener = vi.fn()
    window.addEventListener('app:tab-prev', listener)

    const beforeInputEvent = new Event('before-input-event', { cancelable: true })
    Object.defineProperty(beforeInputEvent, 'input', {
      value: { type: 'keyDown', key: 'Tab', control: true, meta: false, shift: true },
    })
    act(() => {
      webview.dispatchEvent(beforeInputEvent)
    })

    expect(listener).toHaveBeenCalled()
    window.removeEventListener('app:tab-prev', listener)
  })

  it('dispatches app:tab-close on Ctrl+F4 in webview', () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const webview = container.querySelector('webview')!

    const listener = vi.fn()
    window.addEventListener('app:tab-close', listener)

    const beforeInputEvent = new Event('before-input-event', { cancelable: true })
    Object.defineProperty(beforeInputEvent, 'input', {
      value: { type: 'keyDown', key: 'F4', control: true, meta: false, shift: false },
    })
    act(() => {
      webview.dispatchEvent(beforeInputEvent)
    })

    expect(listener).toHaveBeenCalled()
    window.removeEventListener('app:tab-close', listener)
  })

  it('toggles Reload/Stop button based on loading state', async () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const wv = stubWebviewMethods(container.querySelector('webview')!)

    // Initially loading — button should say Stop
    expect(screen.getByTitle('Stop')).toBeInTheDocument()

    act(() => {
      wv.dispatchEvent(new Event('did-stop-loading'))
    })

    await waitFor(() => {
      expect(screen.getByTitle('Reload')).toBeInTheDocument()
    })

    // Click reload
    fireEvent.click(screen.getByTitle('Reload'))
    expect(wv.reload).toHaveBeenCalled()

    // Simulate loading again, then click stop
    act(() => {
      wv.dispatchEvent(new Event('did-start-loading'))
    })

    await waitFor(() => {
      expect(screen.getByTitle('Stop')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Stop'))
    expect(wv.stop).toHaveBeenCalled()
  })

  it('calls goBack and goForward when nav buttons are clicked', async () => {
    const { container } = render(<BrowserTabView url="https://example.com" />)
    const wv = stubWebviewMethods(container.querySelector('webview')!)

    act(() => {
      wv.dispatchEvent(new Event('did-stop-loading'))
    })

    await waitFor(() => {
      expect(screen.getByTitle('Back')).not.toBeDisabled()
    })

    fireEvent.click(screen.getByTitle('Back'))
    expect(wv.goBack).toHaveBeenCalled()

    fireEvent.click(screen.getByTitle('Forward'))
    expect(wv.goForward).toHaveBeenCalled()
  })

  it('restores zoom from localStorage on stop-loading', () => {
    localStorage.setItem('browser-zoom-level', '2')

    const { container } = render(<BrowserTabView url="https://example.com" />)
    const wv = stubWebviewMethods(container.querySelector('webview')!)

    act(() => {
      wv.dispatchEvent(new Event('did-stop-loading'))
    })

    expect(wv.setZoomLevel).toHaveBeenCalledWith(2)
  })
})
