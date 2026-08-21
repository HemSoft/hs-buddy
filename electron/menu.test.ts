import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: vi.fn(template => ({ items: template })),
    setApplicationMenu: vi.fn(),
  },
}))

vi.mock('./zoom', () => ({
  saveZoomLevel: vi.fn(),
}))

const mockMatchesShortcut = vi.fn((..._args: unknown[]) => false)

vi.mock('../src/utils/shortcutMatching', () => ({
  matchesShortcut: (...args: unknown[]) => mockMatchesShortcut(...args),
}))

import { Menu } from 'electron'
import { saveZoomLevel } from './zoom'
import { applicationMenuTemplate, bindWindowBehavior, registerKeyboardShortcuts } from './menu'

type ShortcutDefinition = { key: string; ctrlOrCmd?: boolean; shift?: boolean }
type ShortcutInput = { key: string; control?: boolean; meta?: boolean; shift?: boolean }

function matchesCtrlOrCmd(shortcut: ShortcutDefinition, input: ShortcutInput) {
  return Boolean(shortcut.ctrlOrCmd) === Boolean(input.control || input.meta)
}

function matchesShift(shortcut: ShortcutDefinition, input: ShortcutInput) {
  return Boolean(shortcut.shift) === Boolean(input.shift)
}

function matchesShortcutInput(shortcut: ShortcutDefinition, input: ShortcutInput) {
  return (
    matchesCtrlOrCmd(shortcut, input) && matchesShift(shortcut, input) && input.key === shortcut.key
  )
}

describe('menu', () => {
  const mockWin = {
    webContents: {
      getZoomFactor: vi.fn(() => 1.0),
      setZoomFactor: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
    },
    setFullScreen: vi.fn(),
    isFullScreen: vi.fn(() => false),
  } as unknown as Electron.BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    mockMatchesShortcut.mockReset()
    mockMatchesShortcut.mockImplementation((..._args: unknown[]) => false)
    vi.mocked(mockWin.webContents.getZoomFactor).mockReturnValue(1.0)
    vi.mocked(mockWin.isFullScreen).mockReturnValue(false)
  })

  it('registerKeyboardShortcuts attaches before-input-event listener', () => {
    registerKeyboardShortcuts(mockWin)
    expect(mockWin.webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function))
  })

  it('binds keyboard shortcuts without exposing a native application menu', () => {
    bindWindowBehavior(mockWin)

    expect(Menu.setApplicationMenu).not.toHaveBeenCalled()
    expect(mockWin.webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function))
  })

  it('keyboard handler ignores non-keyDown events', () => {
    registerKeyboardShortcuts(mockWin)
    const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1]
    const event = { preventDefault: vi.fn() }
    handler(event, { type: 'keyUp', key: '+' })
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('keyboard handler dispatches matched shortcut and prevents default', () => {
    mockMatchesShortcut.mockReturnValue(true)
    registerKeyboardShortcuts(mockWin)
    const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1]
    const event = { preventDefault: vi.fn() }
    handler(event, { type: 'keyDown', key: '+' })
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('shortcut Ctrl+- triggers zoomOut', () => {
    mockMatchesShortcut.mockImplementation(
      (entry: unknown) =>
        (entry as { key: string }).key === '-' &&
        (entry as { ctrlOrCmd?: boolean }).ctrlOrCmd === true
    )
    registerKeyboardShortcuts(mockWin)
    const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1]
    handler({ preventDefault: vi.fn() }, { type: 'keyDown', key: '-' })
    expect(mockWin.webContents.setZoomFactor).toHaveBeenCalled()
    expect(saveZoomLevel).toHaveBeenCalled()
  })

  it('shortcut Ctrl+Shift+A sends TOGGLE_ASSISTANT', () => {
    mockMatchesShortcut.mockImplementation(
      (entry: unknown) =>
        (entry as { key: string; shift?: boolean }).key === 'A' &&
        (entry as { shift?: boolean }).shift === true &&
        (entry as { ctrlOrCmd?: boolean }).ctrlOrCmd === true
    )
    registerKeyboardShortcuts(mockWin)
    const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1]
    handler({ preventDefault: vi.fn() }, { type: 'keyDown', key: 'A' })
    expect(mockWin.webContents.send).toHaveBeenCalledWith('toggle-assistant')
  })

  it('shortcut Ctrl+Tab sends TAB_NEXT', () => {
    mockMatchesShortcut.mockImplementation(
      (entry: unknown) =>
        (entry as { key: string }).key === 'Tab' &&
        !(entry as { shift?: boolean }).shift &&
        (entry as { ctrlOrCmd?: boolean }).ctrlOrCmd === true
    )
    registerKeyboardShortcuts(mockWin)
    const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1]
    handler({ preventDefault: vi.fn() }, { type: 'keyDown', key: 'Tab' })
    expect(mockWin.webContents.send).toHaveBeenCalledWith('tab-next')
  })

  it('shortcut F11 toggles full screen', () => {
    mockMatchesShortcut.mockImplementation(
      (entry: unknown) => (entry as { key: string }).key === 'F11'
    )
    registerKeyboardShortcuts(mockWin)
    const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1]
    handler({ preventDefault: vi.fn() }, { type: 'keyDown', key: 'F11' })
    expect(mockWin.setFullScreen).toHaveBeenCalledWith(true)
  })

  it('keyboard handler does nothing when no shortcut matches', () => {
    mockMatchesShortcut.mockReturnValue(false)
    registerKeyboardShortcuts(mockWin)
    const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1]
    const event = { preventDefault: vi.fn() }
    handler(event, { type: 'keyDown', key: 'x' })
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  describe('keyboard shortcut actions', () => {
    let handler: (
      event: { preventDefault: ReturnType<typeof vi.fn> },
      input: {
        type?: string
        key: string
        control?: boolean
        meta?: boolean
        shift?: boolean
      }
    ) => void

    beforeEach(() => {
      // Use real matching logic so the correct SHORTCUT action fires
      mockMatchesShortcut.mockImplementation((...args: unknown[]) => {
        const shortcut = args[0] as ShortcutDefinition
        const input = args[1] as ShortcutInput
        return matchesShortcutInput(shortcut, input)
      })

      registerKeyboardShortcuts(mockWin)
      const calls = vi.mocked(mockWin.webContents.on).mock.calls as [
        string,
        (...args: unknown[]) => unknown,
      ][]
      handler = calls.find(c => c[0] === 'before-input-event')![1] as typeof handler
    })

    it('Ctrl++ triggers zoomIn', () => {
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: '+', control: true, meta: false, shift: false })
      expect(mockWin.webContents.setZoomFactor).toHaveBeenCalledWith(1.1)
      expect(saveZoomLevel).toHaveBeenCalledWith(1.1)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+- triggers zoomOut', () => {
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: '-', control: true, meta: false, shift: false })
      expect(mockWin.webContents.setZoomFactor).toHaveBeenCalledWith(0.9)
      expect(saveZoomLevel).toHaveBeenCalledWith(0.9)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+0 triggers resetZoom', () => {
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: '0', control: true, meta: false, shift: false })
      expect(mockWin.webContents.setZoomFactor).toHaveBeenCalledWith(1.0)
      expect(saveZoomLevel).toHaveBeenCalledWith(1.0)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+Shift+A toggles assistant', () => {
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'A', control: true, meta: false, shift: true })
      expect(mockWin.webContents.send).toHaveBeenCalledWith('toggle-assistant')
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+Tab switches to next tab', () => {
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'Tab', control: true, meta: false, shift: false })
      expect(mockWin.webContents.send).toHaveBeenCalledWith('tab-next')
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+Shift+Tab switches to previous tab', () => {
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'Tab', control: true, meta: false, shift: true })
      expect(mockWin.webContents.send).toHaveBeenCalledWith('tab-prev')
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+F4 closes current tab', () => {
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'F4', control: true, meta: false, shift: false })
      expect(mockWin.webContents.send).toHaveBeenCalledWith('tab-close')
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('F11 toggles full screen', () => {
      const event = { preventDefault: vi.fn() }
      handler(event, { type: 'keyDown', key: 'F11', control: false, meta: false, shift: false })
      expect(mockWin.setFullScreen).toHaveBeenCalledWith(true)
      expect(event.preventDefault).toHaveBeenCalled()
    })
  })

  describe('applicationMenuTemplate', () => {
    it('keeps app and Edit roles on macOS for standard accelerators', () => {
      const template = applicationMenuTemplate('darwin')

      expect(template).toEqual([{ role: 'appMenu' }, { role: 'editMenu' }])
    })

    it('installs an empty menu on Windows and Linux where the frame hides the bar', () => {
      expect(applicationMenuTemplate('win32')).toEqual([])
      expect(applicationMenuTemplate('linux')).toEqual([])
    })
  })
})

describe('menu zoom clamping via keyboard shortcuts', () => {
  beforeEach(() => {
    mockMatchesShortcut.mockImplementation((...args: unknown[]) => {
      const shortcut = args[0] as ShortcutDefinition
      const input = args[1] as ShortcutInput
      return matchesShortcutInput(shortcut, input)
    })
  })

  function clampHarness() {
    const clampWin = {
      webContents: {
        getZoomFactor: vi.fn(() => 1.0),
        setZoomFactor: vi.fn(),
        on: vi.fn(),
        send: vi.fn(),
      },
      setFullScreen: vi.fn(),
      isFullScreen: vi.fn(() => false),
    } as unknown as Electron.BrowserWindow
    registerKeyboardShortcuts(clampWin)
    const calls = vi.mocked(clampWin.webContents.on).mock.calls as [
      string,
      (...args: unknown[]) => unknown,
    ][]
    const handler = calls.find(c => c[0] === 'before-input-event')![1] as (
      event: { preventDefault: ReturnType<typeof vi.fn> },
      input: { type?: string; key: string; control?: boolean; meta?: boolean; shift?: boolean }
    ) => void
    return { clampWin, handler }
  }

  it('Ctrl++ clamps at max zoom', () => {
    const { clampWin, handler } = clampHarness()
    vi.mocked(clampWin.webContents.getZoomFactor).mockReturnValue(3.0)
    const event = { preventDefault: vi.fn() }
    handler(event, { type: 'keyDown', key: '+', control: true, meta: false, shift: false })
    expect(clampWin.webContents.setZoomFactor).toHaveBeenCalledWith(3.0)
  })

  it('Ctrl+- clamps at min zoom', () => {
    const { clampWin, handler } = clampHarness()
    vi.mocked(clampWin.webContents.getZoomFactor).mockReturnValue(0.5)
    const event = { preventDefault: vi.fn() }
    handler(event, { type: 'keyDown', key: '-', control: true, meta: false, shift: false })
    expect(clampWin.webContents.setZoomFactor).toHaveBeenCalledWith(0.5)
  })
})
