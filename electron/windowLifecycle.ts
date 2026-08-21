import type { BrowserWindow } from 'electron'

type WindowFactory = () => BrowserWindow
type WindowBinder = (window: BrowserWindow) => void

export class MainWindowLifecycle {
  private current: BrowserWindow | null = null

  constructor(
    private readonly createWindow: WindowFactory,
    private readonly bindWindow: WindowBinder
  ) {}

  get currentWindow(): BrowserWindow | null {
    return this.current
  }

  openWindow(): BrowserWindow {
    const window = this.createWindow()
    this.current = window
    this.bindWindow(window)
    window.once('closed', () => {
      if (this.current === window) this.current = null
    })
    return window
  }

  activate(): BrowserWindow {
    if (!this.current || this.current.isDestroyed()) return this.openWindow()
    return this.current
  }
}
