import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppTabs } from './useAppTabs'

const mockListProjects = vi.fn(async () => [] as Array<{ id: string; displayName: string }>)

function emitTabEvent(name: string) {
  window.dispatchEvent(new Event(`app:${name}`))
}

describe('useAppTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    Object.defineProperty(window, 'crew', {
      configurable: true,
      value: {
        listProjects: mockListProjects,
      },
    })
  })

  it('keeps the active tab aligned with the committed tab when the same view opens concurrently', async () => {
    const onViewOpen = vi.fn()
    const { result } = renderHook(() => useAppTabs({ onViewOpen }))

    await act(async () => {
      await Promise.all([result.current.openTab('pr-my-prs'), result.current.openTab('pr-my-prs')])
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })

    expect(result.current.activeTabId).toBe(result.current.tabs[0]?.id)
    expect(result.current.activeViewId).toBe('pr-my-prs')
    expect(onViewOpen).toHaveBeenCalledTimes(2)
  })

  it('activates the next available tab when closing the active tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    const firstTabId = result.current.tabs[0]?.id
    const secondTabId = result.current.tabs[1]?.id

    expect(result.current.activeTabId).toBe(secondTabId)

    act(() => {
      if (!secondTabId) {
        throw new Error('Expected a second tab to exist')
      }
      result.current.closeTab(secondTabId)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeTabId).toBe(firstTabId)
    expect(result.current.activeViewId).toBe('pr-my-prs')
  })

  it('cycles to the next tab on tab-next event and wraps around', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    const tab1 = result.current.tabs[0]!.id
    const tab2 = result.current.tabs[1]!.id

    // Active is last opened (tab 3)
    expect(result.current.activeViewId).toBe('copilot-usage')

    // Next → wraps to first
    act(() => emitTabEvent('tab-next'))
    expect(result.current.activeTabId).toBe(tab1)

    // Next → second
    act(() => emitTabEvent('tab-next'))
    expect(result.current.activeTabId).toBe(tab2)
  })

  it('cycles to the previous tab on tab-prev event and wraps around', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    const tab1 = result.current.tabs[0]!.id

    // Active is tab 2
    expect(result.current.activeViewId).toBe('pr-needs-review')

    // Prev → first tab
    act(() => emitTabEvent('tab-prev'))
    expect(result.current.activeTabId).toBe(tab1)

    // Prev → wraps to last (tab 2)
    act(() => emitTabEvent('tab-prev'))
    expect(result.current.activeViewId).toBe('pr-needs-review')
  })

  it('does nothing when cycling with only one tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const tabId = result.current.activeTabId

    act(() => emitTabEvent('tab-next'))
    expect(result.current.activeTabId).toBe(tabId)

    act(() => emitTabEvent('tab-prev'))
    expect(result.current.activeTabId).toBe(tabId)
  })

  it('selects a tab by ID', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    const firstTabId = result.current.tabs[0]!.id

    act(() => {
      result.current.setActiveTabId(firstTabId)
    })

    expect(result.current.activeTabId).toBe(firstTabId)
    expect(result.current.activeViewId).toBe('pr-my-prs')
  })

  it('selectTab is a no-op when already active', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const tabId = result.current.activeTabId!
    const prevState = result.current.tabs

    act(() => {
      result.current.setActiveTabId(tabId)
    })

    // Same reference — state didn't change
    expect(result.current.tabs).toBe(prevState)
  })

  it('closeOtherTabs keeps only the specified tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    const keepId = result.current.tabs[1]!.id

    act(() => {
      result.current.closeOtherTabs(keepId)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe('pr-needs-review')
    expect(result.current.activeTabId).toBe(keepId)
  })

  it('closeOtherTabs is a no-op for unknown tab id', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const prevTabs = result.current.tabs

    act(() => {
      result.current.closeOtherTabs('nonexistent')
    })

    expect(result.current.tabs).toBe(prevTabs)
  })

  it('closeTabsToRight removes tabs after the specified index', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    const firstTabId = result.current.tabs[0]!.id

    act(() => {
      result.current.closeTabsToRight(firstTabId)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe('pr-my-prs')
  })

  it('closeTabsToRight moves active tab when it was to the right', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    // Active is copilot-usage (last opened)
    const firstTabId = result.current.tabs[0]!.id

    act(() => {
      result.current.closeTabsToRight(firstTabId)
    })

    // Active tab was closed, so it should fall back to the pivot tab
    expect(result.current.activeTabId).toBe(firstTabId)
  })

  it('closeTabsToRight is a no-op for unknown tab id', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const prevTabs = result.current.tabs

    act(() => {
      result.current.closeTabsToRight('nonexistent')
    })

    expect(result.current.tabs).toBe(prevTabs)
  })

  it('closeAllTabs empties tabs and nulls active', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    act(() => {
      result.current.closeAllTabs()
    })

    expect(result.current.tabs).toHaveLength(0)
    expect(result.current.activeTabId).toBeNull()
    expect(result.current.activeViewId).toBeNull()
  })

  it('closeActiveTab closes the active tab and activates the next', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    act(() => emitTabEvent('tab-close'))

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeViewId).toBe('pr-my-prs')
  })

  it('closeActiveTab empties when last tab is closed', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    act(() => emitTabEvent('tab-close'))

    expect(result.current.tabs).toHaveLength(0)
    expect(result.current.activeTabId).toBeNull()
  })

  it('closeActiveTab is a no-op when no tabs exist', () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    act(() => emitTabEvent('tab-close'))

    expect(result.current.tabs).toHaveLength(0)
    expect(result.current.activeTabId).toBeNull()
  })

  it('closeView closes a tab by its viewId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    act(() => {
      result.current.closeView('pr-my-prs')
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe('pr-needs-review')
  })

  it('closeView is a no-op for nonexistent viewId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const prevTabs = result.current.tabs

    act(() => {
      result.current.closeView('nonexistent')
    })

    expect(result.current.tabs).toBe(prevTabs)
  })

  it('closeTab is a no-op for nonexistent tab id', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const prevTabs = result.current.tabs

    act(() => {
      result.current.closeTab('nonexistent')
    })

    expect(result.current.tabs).toBe(prevTabs)
  })

  it('closing a non-active tab preserves the active tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    const firstTabId = result.current.tabs[0]!.id
    const secondTabId = result.current.tabs[1]!.id

    // Active is second tab
    expect(result.current.activeTabId).toBe(secondTabId)

    act(() => {
      result.current.closeTab(firstTabId)
    })

    // Active remains second tab
    expect(result.current.activeTabId).toBe(secondTabId)
    expect(result.current.tabs).toHaveLength(1)
  })

  it('opens a tab via copilot:open-result event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('copilot:open-result', { detail: { resultId: 'res-42' } })
      )
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })

    expect(result.current.tabs[0]!.viewId).toBe('copilot-result:res-42')
  })

  it('opens a tab via pr-review:open event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    const detail = {
      prUrl: 'https://github.com/org/repo/pull/1',
      prTitle: 'Test PR',
      prNumber: 1,
      repo: 'repo',
      org: 'org',
      author: 'user',
    }

    await act(async () => {
      window.dispatchEvent(new CustomEvent('pr-review:open', { detail }))
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })

    expect(result.current.tabs[0]!.viewId).toContain('pr-review:')
  })

  it('opens a tab via app:navigate event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: 'copilot-usage' } }))
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })

    expect(result.current.tabs[0]!.viewId).toBe('copilot-usage')
  })

  it('labels crew-project tabs with project display name', async () => {
    mockListProjects.mockResolvedValue([{ id: 'proj-1', displayName: 'My Project' }])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      expect(result.current.tabs[0]!.label).toBe('My Project')
    })
  })

  it('falls back to "PR Detail" label when crew listProjects rejects', async () => {
    mockListProjects.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })

    expect(result.current.tabs[0]!.label).toBe('PR Detail')
  })
})
