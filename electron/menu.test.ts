import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  dialog: { showMessageBox: vi.fn() },
  Menu: { buildFromTemplate: vi.fn(template => ({ items: template })) },
}))

vi.mock('./zoom', () => ({
  saveZoomLevel: vi.fn(),
}))

const mockMatchesShortcut = vi.fn((..._args: unknown[]) => false)

vi.mock('../src/utils/shortcutMatching', () => ({
  matchesShortcut: (...args: unknown[]) => mockMatchesShortcut(...args),
}))

import { dialog } from 'electron'
import { saveZoomLevel } from './zoom'
import { buildMenu, registerKeyboardShortcuts } from './menu'

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
    vi.mocked(mockWin.webContents.getZoomFactor).mockReturnValue(1.0)
    vi.mocked(mockWin.isFullScreen).mockReturnValue(false)
  })

  it('buildMenu returns a menu object', () => {
    const menu = buildMenu(mockWin)
    expect(menu).toBeDefined()
    expect(menu).toHaveProperty('items')
  })

  it('registerKeyboardShortcuts attaches before-input-event listener', () => {
    registerKeyboardShortcuts(mockWin)
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
      (entry: unknown) => (entry as { key: string }).key === '-'
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
        (entry as { shift?: boolean }).shift === true
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
        (entry as { key: string }).key === 'Tab' && !(entry as { shift?: boolean }).shift
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

  describe('menu click handlers', () => {
    it('Zoom In increases zoom and saves', () => {
      vi.mocked(mockWin.webContents.getZoomFactor).mockReturnValue(1.0)
      const menu = buildMenu(mockWin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewSubmenu = (menu.items as any[])[1].submenu
      const zoomInItem = viewSubmenu.find((item: { label?: string }) => item.label === 'Zoom In')
      zoomInItem.click()
      expect(mockWin.webContents.setZoomFactor).toHaveBeenCalled()
      expect(saveZoomLevel).toHaveBeenCalled()
    })

    it('Zoom Out decreases zoom and saves', () => {
      vi.mocked(mockWin.webContents.getZoomFactor).mockReturnValue(1.0)
      const menu = buildMenu(mockWin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewSubmenu = (menu.items as any[])[1].submenu
      const zoomOutItem = viewSubmenu.find((item: { label?: string }) => item.label === 'Zoom Out')
      zoomOutItem.click()
      expect(mockWin.webContents.setZoomFactor).toHaveBeenCalled()
      expect(saveZoomLevel).toHaveBeenCalled()
    })

    it('Reset Zoom sets zoom to 1.0', () => {
      const menu = buildMenu(mockWin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewSubmenu = (menu.items as any[])[1].submenu
      const resetItem = viewSubmenu.find((item: { label?: string }) => item.label === 'Reset Zoom')
      resetItem.click()
      expect(mockWin.webContents.setZoomFactor).toHaveBeenCalledWith(1.0)
      expect(saveZoomLevel).toHaveBeenCalledWith(1.0)
    })

    it('Toggle Full Screen toggles full screen state', () => {
      vi.mocked(mockWin.isFullScreen).mockReturnValue(false)
      const menu = buildMenu(mockWin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewSubmenu = (menu.items as any[])[1].submenu
      const toggleItem = viewSubmenu.find(
        (item: { label?: string }) => item.label === 'Toggle Full Screen'
      )
      toggleItem.click()
      expect(mockWin.setFullScreen).toHaveBeenCalledWith(true)
    })

    it('About Buddy shows message box', () => {
      const menu = buildMenu(mockWin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const helpSubmenu = (menu.items as any[])[2].submenu
      const aboutItem = helpSubmenu.find((item: { label?: string }) => item.label === 'About Buddy')
      aboutItem.click()
      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        mockWin,
        expect.objectContaining({ title: 'About Buddy' })
      )
    })

    it('Zoom In clamps at max zoom', () => {
      vi.mocked(mockWin.webContents.getZoomFactor).mockReturnValue(3.0)
      const menu = buildMenu(mockWin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewSubmenu = (menu.items as any[])[1].submenu
      const zoomInItem = viewSubmenu.find((item: { label?: string }) => item.label === 'Zoom In')
      zoomInItem.click()
      expect(mockWin.webContents.setZoomFactor).toHaveBeenCalledWith(3.0)
    })

    it('Zoom Out clamps at min zoom', () => {
      vi.mocked(mockWin.webContents.getZoomFactor).mockReturnValue(0.5)
      const menu = buildMenu(mockWin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewSubmenu = (menu.items as any[])[1].submenu
      const zoomOutItem = viewSubmenu.find((item: { label?: string }) => item.label === 'Zoom Out')
      zoomOutItem.click()
      expect(mockWin.webContents.setZoomFactor).toHaveBeenCalledWith(0.5)
    })
  })
})
