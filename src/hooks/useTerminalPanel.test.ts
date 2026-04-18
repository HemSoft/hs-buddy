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

vi.mock('./useConvex', () => ({
  useSettings: () => undefined,
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
})
