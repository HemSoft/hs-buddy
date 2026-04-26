import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock terminalSessions
vi.mock('../components/terminal/terminalSessions', () => ({
  getSessionId: vi.fn(),
  setSessionId: vi.fn(),
  removeSession: vi.fn(),
  killTerminalSession: vi.fn(),
}))

const mockUpdateTerminalPanelHeight = vi.fn().mockResolvedValue(undefined)
const mockUpdateTerminalTabs = vi.fn().mockResolvedValue(undefined)
let mockSettingsReturn: Record<string, unknown> | undefined = undefined

vi.mock('./useConvex', () => ({
  useSettings: () => mockSettingsReturn,
  useSettingsMutations: () => ({
    updateTerminalPanelHeight: mockUpdateTerminalPanelHeight,
    updateTerminalTabs: mockUpdateTerminalTabs,
  }),
}))

import { killTerminalSession, getSessionId } from '../components/terminal/terminalSessions'
import { useTerminalPanel } from './useTerminalPanel'

const mockInvoke = vi.fn()
const mockResolveRepoPath = vi.fn()

describe('useTerminalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettingsReturn = undefined
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { invoke: mockInvoke },
    })
    Object.defineProperty(window, 'terminal', {
      configurable: true,
      value: { resolveRepoPath: mockResolveRepoPath },
    })

    // Default: config loads successfully
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-terminal-open') return Promise.resolve(false)
      if (channel === 'config:get-terminal-panel-height') return Promise.resolve(300)
      return Promise.resolve()
    })
    mockResolveRepoPath.mockResolvedValue({ path: '/mock/repo/path' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with default state before config loads', () => {
    const { result } = renderHook(() => useTerminalPanel())
    expect(result.current.terminalOpen).toBe(false)
    expect(result.current.terminalTabs).toEqual([])
    expect(result.current.activeTerminalTabId).toBeNull()
    expect(result.current.panelHeight).toBe(300)
  })

  it('loads persisted open state from config', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-terminal-open') return Promise.resolve(true)
      if (channel === 'config:get-terminal-panel-height') return Promise.resolve(400)
      return Promise.resolve()
    })

    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })
    expect(result.current.terminalOpen).toBe(true)
    expect(result.current.panelHeight).toBe(400)
  })

  it('ignores invalid config values', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-terminal-open') return Promise.resolve('not-boolean')
      if (channel === 'config:get-terminal-panel-height') return Promise.resolve(50) // below 100 minimum
      return Promise.resolve()
    })

    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })
    // Should keep defaults for invalid types, clamp out-of-range numbers
    expect(result.current.terminalOpen).toBe(false)
    expect(result.current.panelHeight).toBe(100) // 50 clamped to minimum
  })

  it('toggleTerminal opens panel and creates a tab when none exist', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => {
      result.current.toggleTerminal()
    })

    expect(result.current.terminalOpen).toBe(true)
    expect(result.current.terminalTabs.length).toBe(1)
    expect(result.current.activeTerminalTabId).toBeTruthy()
  })

  it('toggleTerminal closes panel on second call', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => {
      result.current.toggleTerminal()
    })
    expect(result.current.terminalOpen).toBe(true)

    act(() => {
      result.current.toggleTerminal()
    })
    expect(result.current.terminalOpen).toBe(false)
  })

  it('addTerminalTab creates a new tab with resolved path', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab({ owner: 'acme', repo: 'widget' })
    })

    expect(tab!).toBeDefined()
    expect(tab!.title).toBe('widget')
    expect(tab!.cwd).toBe('/mock/repo/path')
    expect(tab!.repoSlug).toBe('acme/widget')
    expect(result.current.terminalTabs.length).toBe(1)
    expect(result.current.activeTerminalTabId).toBe(tab!.id)
  })

  it('addTerminalTab deduplicates by repo slug', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab1: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    let tab2: Awaited<ReturnType<typeof result.current.addTerminalTab>>

    await act(async () => {
      tab1 = await result.current.addTerminalTab({ owner: 'acme', repo: 'widget' })
    })
    await act(async () => {
      tab2 = await result.current.addTerminalTab({ owner: 'acme', repo: 'widget' })
    })

    expect(tab1!.id).toBe(tab2!.id)
    expect(result.current.terminalTabs.length).toBe(1)
  })

  it('addTerminalTab with null context creates generic tab', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    expect(tab!.title).toMatch(/^Terminal \d+$/)
    expect(tab!.cwd).toBe('')
    expect(tab!.repoSlug).toBeUndefined()
  })

  it('addTerminalTab falls back to empty cwd when resolveRepoPath rejects', async () => {
    mockResolveRepoPath.mockRejectedValue(new Error('IPC fail'))

    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab({ owner: 'acme', repo: 'widget' })
    })

    expect(tab!).toBeDefined()
    expect(tab!.title).toBe('widget')
    expect(tab!.cwd).toBe('')
    expect(tab!.repoSlug).toBe('acme/widget')
  })

  it('closeTerminalTab removes tab and kills session', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    act(() => {
      result.current.closeTerminalTab(tab!.id)
    })

    expect(killTerminalSession).toHaveBeenCalledWith(tab!.id)
    expect(result.current.terminalTabs.length).toBe(0)
    expect(result.current.activeTerminalTabId).toBeNull()
  })

  it('closeTerminalTab activates adjacent tab', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab1: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    let tab2: Awaited<ReturnType<typeof result.current.addTerminalTab>>

    await act(async () => {
      tab1 = await result.current.addTerminalTab(null)
    })
    await act(async () => {
      tab2 = await result.current.addTerminalTab(null)
    })

    // Active tab is tab2 (last added)
    expect(result.current.activeTerminalTabId).toBe(tab2!.id)

    // Close tab2 — should activate tab1
    act(() => {
      result.current.closeTerminalTab(tab2!.id)
    })

    expect(result.current.terminalTabs.length).toBe(1)
    expect(result.current.activeTerminalTabId).toBe(tab1!.id)
  })

  it('closing last tab closes the panel', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => {
      result.current.toggleTerminal()
    })
    expect(result.current.terminalOpen).toBe(true)

    const tabId = result.current.terminalTabs[0].id
    act(() => {
      result.current.closeTerminalTab(tabId)
    })

    expect(result.current.terminalOpen).toBe(false)
  })

  it('selectTerminalTab switches active tab', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab1: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    let tab2: Awaited<ReturnType<typeof result.current.addTerminalTab>>

    await act(async () => {
      tab1 = await result.current.addTerminalTab(null)
    })
    await act(async () => {
      tab2 = await result.current.addTerminalTab(null)
    })

    expect(result.current.activeTerminalTabId).toBe(tab2!.id)

    act(() => {
      result.current.selectTerminalTab(tab1!.id)
    })

    expect(result.current.activeTerminalTabId).toBe(tab1!.id)
  })

  it('onPanelResize updates height and persists to config', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => {
      result.current.onPanelResize([500, 250])
    })

    expect(result.current.panelHeight).toBe(250)

    // Advance past debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(mockInvoke).toHaveBeenCalledWith('config:set-terminal-panel-height', 250)
    vi.useRealTimers()
  })

  it('Ctrl+` keyboard shortcut toggles terminal', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', ctrlKey: true }))
    })

    expect(result.current.terminalOpen).toBe(true)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', ctrlKey: true }))
    })

    expect(result.current.terminalOpen).toBe(false)
  })

  it('Ctrl+` keyboard shortcut passes activeViewId to toggleTerminal', async () => {
    const { result } = renderHook(() => useTerminalPanel('repo-detail:acme/widget'))

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', ctrlKey: true }))
    })

    expect(result.current.terminalOpen).toBe(true)
    // Should have created a tab with repo context from the activeViewId
    await vi.waitFor(() => {
      expect(result.current.terminalTabs.length).toBe(1)
    })
    expect(result.current.terminalTabs[0].repoSlug).toBe('acme/widget')
  })

  it('unmount kills active terminal sessions via ref', async () => {
    const { result, unmount } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    await act(async () => {
      await result.current.addTerminalTab(null)
    })

    const tabId = result.current.terminalTabs[0].id
    vi.mocked(getSessionId).mockReturnValue('session-123')

    unmount()

    expect(killTerminalSession).toHaveBeenCalledWith(tabId)
  })

  it('onPanelResize ignores when terminal height is zero', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    const heightBefore = result.current.panelHeight
    act(() => {
      result.current.onPanelResize([500, 0])
    })

    expect(result.current.panelHeight).toBe(heightBefore)
  })

  it('onPanelResize ignores when sizes array is too short', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    const heightBefore = result.current.panelHeight
    act(() => {
      result.current.onPanelResize([500])
    })

    expect(result.current.panelHeight).toBe(heightBefore)
  })

  it('toggleTerminal with view ID creates new tab for unknown repo', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    // Add a tab for a different repo
    await act(async () => {
      await result.current.addTerminalTab({ owner: 'acme', repo: 'widget' })
    })

    // Open then close
    act(() => {
      result.current.toggleTerminal()
    })
    act(() => {
      result.current.toggleTerminal()
    })

    // Reopen with a different repo view
    act(() => {
      result.current.toggleTerminal('repo-detail:other-org/other-repo')
    })

    expect(result.current.terminalOpen).toBe(true)
    // Should have created a new tab for other-org/other-repo (async addTerminalTab)
    await vi.waitFor(() => {
      expect(result.current.terminalTabs.length).toBe(2)
    })
  })

  it('handles config load rejection gracefully', async () => {
    mockInvoke.mockImplementation(() => Promise.reject(new Error('IPC fail')))

    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    // Defaults should be preserved
    expect(result.current.terminalOpen).toBe(false)
    expect(result.current.panelHeight).toBe(300)
  })

  it('toggleTerminal persists open state and handles IPC error silently', async () => {
    // Make the set call reject to exercise the .catch(() => {}) path
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-terminal-open') return Promise.resolve(false)
      if (channel === 'config:get-terminal-panel-height') return Promise.resolve(300)
      if (channel === 'config:set-terminal-open') return Promise.reject(new Error('write fail'))
      return Promise.resolve()
    })

    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    // Should not throw despite IPC failure
    act(() => {
      result.current.toggleTerminal()
    })

    expect(result.current.terminalOpen).toBe(true)
  })

  it('closeTerminalTab persists panel-close IPC error silently', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-terminal-open') return Promise.resolve(false)
      if (channel === 'config:get-terminal-panel-height') return Promise.resolve(300)
      if (channel === 'config:set-terminal-open') return Promise.reject(new Error('write fail'))
      return Promise.resolve()
    })

    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    // Open and create a tab
    act(() => {
      result.current.toggleTerminal()
    })
    const tabId = result.current.terminalTabs[0].id

    // Close the last tab — triggers config:set-terminal-open(false) which rejects
    act(() => {
      result.current.closeTerminalTab(tabId)
    })

    // Should not throw, panel should be closed
    expect(result.current.terminalOpen).toBe(false)
  })

  it('onPanelResize handles IPC save error silently', async () => {
    vi.useFakeTimers()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-terminal-open') return Promise.resolve(false)
      if (channel === 'config:get-terminal-panel-height') return Promise.resolve(300)
      if (channel === 'config:set-terminal-panel-height')
        return Promise.reject(new Error('write fail'))
      return Promise.resolve()
    })

    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    // Should not throw despite IPC failure on save
    act(() => {
      result.current.onPanelResize([500, 250])
    })
    expect(result.current.panelHeight).toBe(250)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    vi.useRealTimers()
  })

  it('toggleTerminal with view ID focuses existing repo tab', async () => {
    const { result } = renderHook(() => useTerminalPanel())

    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    // Add a tab for acme/widget
    await act(async () => {
      await result.current.addTerminalTab({ owner: 'acme', repo: 'widget' })
    })

    // Add another tab
    await act(async () => {
      await result.current.addTerminalTab(null)
    })

    // Open the panel first, then close it
    act(() => {
      result.current.toggleTerminal()
    })
    expect(result.current.terminalOpen).toBe(true)

    act(() => {
      result.current.toggleTerminal()
    })
    expect(result.current.terminalOpen).toBe(false)

    // Reopen with a view ID matching the repo
    act(() => {
      result.current.toggleTerminal('repo-detail:acme/widget')
    })

    expect(result.current.terminalOpen).toBe(true)
    // Should focus the existing tab for acme/widget
    const acmeTab = result.current.terminalTabs.find(t => t.repoSlug === 'acme/widget')
    expect(result.current.activeTerminalTabId).toBe(acmeTab!.id)
  })

  // Uncovered branch tests
  it('onPanelResize with NaN should not change panelHeight', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    const heightBefore = result.current.panelHeight
    act(() => {
      result.current.onPanelResize([500, NaN])
    })

    expect(result.current.panelHeight).toBe(heightBefore)
  })

  it('closeTerminalTab with non-existent tabId should be no-op', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    const tabsBefore = result.current.terminalTabs.length
    act(() => {
      result.current.closeTerminalTab('non-existent')
    })

    expect(result.current.terminalTabs.length).toBe(tabsBefore)
    expect(result.current.activeTerminalTabId).toBe(tab!.id)
  })

  it('closeTerminalTab for non-active tab should not change activeTerminalTabId', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab1: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    let tab2: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab1 = await result.current.addTerminalTab(null)
    })
    await act(async () => {
      tab2 = await result.current.addTerminalTab(null)
    })

    // Select tab1 (tab2 is currently active)
    act(() => {
      result.current.selectTerminalTab(tab1!.id)
    })
    expect(result.current.activeTerminalTabId).toBe(tab1!.id)

    // Close tab2 (the non-active tab)
    act(() => {
      result.current.closeTerminalTab(tab2!.id)
    })

    expect(result.current.activeTerminalTabId).toBe(tab1!.id)
    expect(result.current.terminalTabs.length).toBe(1)
  })

  it('renameTerminalTab with empty string should not rename', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    const titleBefore = result.current.terminalTabs[0].title
    act(() => {
      result.current.renameTerminalTab(tab!.id, '')
    })

    expect(result.current.terminalTabs[0].title).toBe(titleBefore)
  })

  it('renameTerminalTab with whitespace-only string should not rename', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    const titleBefore = result.current.terminalTabs[0].title
    act(() => {
      result.current.renameTerminalTab(tab!.id, '   ')
    })

    expect(result.current.terminalTabs[0].title).toBe(titleBefore)
  })

  it('renameTerminalTab with same title should not change tabs', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    const title = result.current.terminalTabs[0].title
    const tabsBefore = result.current.terminalTabs

    act(() => {
      result.current.renameTerminalTab(tab!.id, title)
    })

    expect(result.current.terminalTabs).toBe(tabsBefore)
  })

  it('renameTerminalTab with non-existent tabId should be no-op', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    await act(async () => {
      await result.current.addTerminalTab(null)
    })

    const tabsBefore = result.current.terminalTabs
    act(() => {
      result.current.renameTerminalTab('fake-id', 'New Name')
    })

    expect(result.current.terminalTabs).toBe(tabsBefore)
  })

  it('renameTerminalTab with a different title successfully renames the tab', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    act(() => {
      result.current.renameTerminalTab(tab!.id, 'Brand New Title')
    })

    expect(result.current.terminalTabs[0].title).toBe('Brand New Title')
  })

  it('setTerminalTabColor sets and clears color', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    // Set color
    act(() => {
      result.current.setTerminalTabColor(tab!.id, '#ff0000')
    })

    expect(result.current.terminalTabs[0].color).toBe('#ff0000')

    // Clear color
    act(() => {
      result.current.setTerminalTabColor(tab!.id, undefined)
    })

    expect(result.current.terminalTabs[0].color).toBeUndefined()
  })

  it('reorderTerminalTabs with same ID should be no-op', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    const tabsBefore = result.current.terminalTabs
    act(() => {
      result.current.reorderTerminalTabs(tab!.id, tab!.id)
    })

    expect(result.current.terminalTabs).toBe(tabsBefore)
  })

  it('reorderTerminalTabs with invalid IDs should be no-op', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    await act(async () => {
      await result.current.addTerminalTab(null)
    })

    const tabsBefore = result.current.terminalTabs
    act(() => {
      result.current.reorderTerminalTabs('fake1', 'fake2')
    })

    expect(result.current.terminalTabs).toBe(tabsBefore)
  })

  it('reorderTerminalTabs successfully reorders tabs', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tabA: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    let tabC: Awaited<ReturnType<typeof result.current.addTerminalTab>>

    await act(async () => {
      tabA = await result.current.addTerminalTab(null)
    })
    await act(async () => {
      await result.current.addTerminalTab(null)
    })
    await act(async () => {
      tabC = await result.current.addTerminalTab(null)
    })

    expect(result.current.terminalTabs[0].id).toBe(tabA!.id)
    expect(result.current.terminalTabs[2].id).toBe(tabC!.id)

    // Move A to C's position
    act(() => {
      result.current.reorderTerminalTabs(tabA!.id, tabC!.id)
    })

    // Verify order changed
    expect(result.current.terminalTabs[0].id).not.toBe(tabA!.id)
  })

  it('updateTabCwd with same cwd should be no-op', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    const tabsBefore = result.current.terminalTabs
    act(() => {
      result.current.updateTabCwd(tab!.id, tab!.cwd)
    })

    expect(result.current.terminalTabs).toBe(tabsBefore)
  })

  it('updateTabCwd with non-existent tabId should be no-op', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    await act(async () => {
      await result.current.addTerminalTab(null)
    })

    const tabsBefore = result.current.terminalTabs
    act(() => {
      result.current.updateTabCwd('fake', '/new/path')
    })

    expect(result.current.terminalTabs).toBe(tabsBefore)
  })

  it('updateTabCwd successfully updates working directory', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tab: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tab = await result.current.addTerminalTab(null)
    })

    const cwdBefore = result.current.terminalTabs[0].cwd
    act(() => {
      result.current.updateTabCwd(tab!.id, '/new/path')
    })

    expect(result.current.terminalTabs[0].cwd).toBe('/new/path')
    expect(result.current.terminalTabs[0].cwd).not.toBe(cwdBefore)
  })

  it('renameTerminalTab only renames the target tab, leaving others unchanged', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tabA: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    let tabB: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tabA = await result.current.addTerminalTab(null)
    })
    await act(async () => {
      tabB = await result.current.addTerminalTab(null)
    })

    act(() => {
      result.current.renameTerminalTab(tabA!.id, 'Renamed A')
    })

    expect(result.current.terminalTabs[0].title).toBe('Renamed A')
    expect(result.current.terminalTabs[1].title).toBe(tabB!.title)
  })

  it('setTerminalTabColor only changes the target tab color, leaving others unchanged', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tabA: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tabA = await result.current.addTerminalTab(null)
    })
    await act(async () => {
      await result.current.addTerminalTab(null)
    })

    act(() => {
      result.current.setTerminalTabColor(tabA!.id, '#00ff00')
    })

    expect(result.current.terminalTabs[0].color).toBe('#00ff00')
    expect(result.current.terminalTabs[1].color).toBeUndefined()
  })

  it('updateTabCwd only updates the target tab cwd, leaving others unchanged', async () => {
    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    let tabA: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    let tabB: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    await act(async () => {
      tabA = await result.current.addTerminalTab(null)
    })
    await act(async () => {
      tabB = await result.current.addTerminalTab(null)
    })

    act(() => {
      result.current.updateTabCwd(tabA!.id, '/updated/path')
    })

    expect(result.current.terminalTabs[0].cwd).toBe('/updated/path')
    expect(result.current.terminalTabs[1].cwd).toBe(tabB!.cwd)
  })

  it('Convex sync applies height when local config is null', async () => {
    // Provide settings with a terminalPanelHeight so the Convex sync effect fires
    mockSettingsReturn = { terminalPanelHeight: 450 }

    let panelHeightCallCount = 0
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'config:get-terminal-open') return Promise.resolve(false)
      // First panel-height call (initial load) returns 300, second call (sync check) returns null
      if (channel === 'config:get-terminal-panel-height') {
        panelHeightCallCount += 1
        return panelHeightCallCount === 2 ? Promise.resolve(null) : Promise.resolve(300)
      }
      return Promise.resolve()
    })

    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    // Convex sync effect should apply the settings value since local config is null
    await vi.waitFor(() => expect(result.current.panelHeight).toBe(450))
    expect(panelHeightCallCount).toBe(2)
  })

  it('addTerminalTab post-async dedup returns existing tab', async () => {
    // Make resolveRepoPath slow so two concurrent calls can race
    let resolveFirst!: (value: { path: string }) => void
    let resolveSecond!: (value: { path: string }) => void
    mockResolveRepoPath
      .mockImplementationOnce(
        () =>
          new Promise<{ path: string }>(r => {
            resolveFirst = r
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ path: string }>(r => {
            resolveSecond = r
          })
      )

    const { result } = renderHook(() => useTerminalPanel())
    await vi.waitFor(() => expect(result.current.loaded).toBe(true))

    // Start two concurrent addTerminalTab calls for the same repo
    let tab1: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    let tab2: Awaited<ReturnType<typeof result.current.addTerminalTab>>
    const p1 = act(async () => {
      tab1 = await result.current.addTerminalTab({ owner: 'acme', repo: 'widget' })
    })
    const p2 = act(async () => {
      tab2 = await result.current.addTerminalTab({ owner: 'acme', repo: 'widget' })
    })

    // Resolve the first call, creating the tab
    resolveFirst({ path: '/repo/path' })
    await p1

    // Resolve the second call; it should hit the post-async dedup check
    resolveSecond({ path: '/repo/path' })
    await p2

    // Both should return the same tab
    expect(tab1!.id).toBe(tab2!.id)
    expect(result.current.terminalTabs.length).toBe(1)
  })
})
