import { describe, expect, it, vi } from 'vitest'
import { MainWindowLifecycle } from './windowLifecycle'

function mockWindow() {
  let closed: (() => void) | undefined
  const window = {
    isDestroyed: vi.fn(() => false),
    once: vi.fn((event: string, listener: () => void) => {
      if (event === 'closed') closed = listener
      return window
    }),
  } as unknown as Electron.BrowserWindow
  return { window, close: () => closed?.() }
}

describe('MainWindowLifecycle', () => {
  it('recreates and rebinds the main window after close and activate', () => {
    const initial = mockWindow()
    const recreated = mockWindow()
    const createWindow = vi
      .fn()
      .mockReturnValueOnce(initial.window)
      .mockReturnValue(recreated.window)
    const bindWindow = vi.fn()
    const lifecycle = new MainWindowLifecycle(createWindow, bindWindow)

    lifecycle.openWindow()
    initial.close()
    const activeWindow = lifecycle.activate()

    expect(activeWindow).toBe(recreated.window)
    expect(createWindow).toHaveBeenCalledTimes(2)
    expect(bindWindow).toHaveBeenNthCalledWith(1, initial.window)
    expect(bindWindow).toHaveBeenNthCalledWith(2, recreated.window)
    expect(lifecycle.currentWindow).toBe(recreated.window)
  })

  it('keeps the current live window on activate', () => {
    const initial = mockWindow()
    const createWindow = vi.fn(() => initial.window)
    const bindWindow = vi.fn()
    const lifecycle = new MainWindowLifecycle(createWindow, bindWindow)
    lifecycle.openWindow()

    expect(lifecycle.activate()).toBe(initial.window)
    expect(createWindow).toHaveBeenCalledOnce()
    expect(bindWindow).toHaveBeenCalledOnce()
  })

  it('recreates a window reported as destroyed even before its closed event', () => {
    const initial = mockWindow()
    const recreated = mockWindow()
    vi.mocked(initial.window.isDestroyed).mockReturnValue(true)
    const createWindow = vi
      .fn()
      .mockReturnValueOnce(initial.window)
      .mockReturnValue(recreated.window)
    const lifecycle = new MainWindowLifecycle(createWindow, vi.fn())
    lifecycle.openWindow()

    expect(lifecycle.activate()).toBe(recreated.window)
  })

  it('does not clear a replacement when an older window closes late', () => {
    const initial = mockWindow()
    const recreated = mockWindow()
    vi.mocked(initial.window.isDestroyed).mockReturnValue(true)
    const createWindow = vi
      .fn()
      .mockReturnValueOnce(initial.window)
      .mockReturnValue(recreated.window)
    const lifecycle = new MainWindowLifecycle(createWindow, vi.fn())
    lifecycle.openWindow()
    lifecycle.activate()

    initial.close()

    expect(lifecycle.currentWindow).toBe(recreated.window)
  })
})
