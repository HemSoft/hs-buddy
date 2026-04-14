import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppTabs, DASHBOARD_VIEW_ID } from './useAppTabs'

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

  it('starts with a dashboard tab', () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe(DASHBOARD_VIEW_ID)
    expect(result.current.activeViewId).toBe(DASHBOARD_VIEW_ID)
  })

  it('keeps the active tab aligned with the committed tab when the same view opens concurrently', async () => {
    const onViewOpen = vi.fn()
    const { result } = renderHook(() => useAppTabs({ onViewOpen }))

    await act(async () => {
      await Promise.all([result.current.openTab('pr-my-prs'), result.current.openTab('pr-my-prs')])
    })

    await waitFor(() => {
      // dashboard + pr-my-prs
      expect(result.current.tabs).toHaveLength(2)
    })

    const prTab = result.current.tabs.find(t => t.viewId === 'pr-my-prs')!
    expect(result.current.activeTabId).toBe(prTab.id)
    expect(result.current.activeViewId).toBe('pr-my-prs')
  })

  it('activates the next available tab when closing the active tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    const prMyPrsTab = result.current.tabs.find(t => t.viewId === 'pr-my-prs')!
    const needsReviewTab = result.current.tabs.find(t => t.viewId === 'pr-needs-review')!

    expect(result.current.activeTabId).toBe(needsReviewTab.id)

    act(() => {
      result.current.closeTab(needsReviewTab.id)
    })

    // dashboard + pr-my-prs
    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.activeTabId).toBe(prMyPrsTab.id)
    expect(result.current.activeViewId).toBe('pr-my-prs')
  })

  it('cycles to the next tab on tab-next event and wraps around', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    // Active is last opened (copilot-usage)
    expect(result.current.activeViewId).toBe('copilot-usage')

    // Next → wraps to dashboard
    act(() => emitTabEvent('tab-next'))
    expect(result.current.activeViewId).toBe(DASHBOARD_VIEW_ID)

    // Next → pr-my-prs
    act(() => emitTabEvent('tab-next'))
    expect(result.current.activeViewId).toBe('pr-my-prs')
  })

  it('cycles to the previous tab on tab-prev event and wraps around', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    // Active is pr-needs-review
    expect(result.current.activeViewId).toBe('pr-needs-review')

    // Prev → pr-my-prs
    act(() => emitTabEvent('tab-prev'))
    expect(result.current.activeViewId).toBe('pr-my-prs')

    // Prev → dashboard
    act(() => emitTabEvent('tab-prev'))
    expect(result.current.activeViewId).toBe(DASHBOARD_VIEW_ID)

    // Prev → wraps to last (pr-needs-review)
    act(() => emitTabEvent('tab-prev'))
    expect(result.current.activeViewId).toBe('pr-needs-review')
  })

  it('does nothing when cycling with only one tab', () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

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

    const dashboardTab = result.current.tabs.find(t => t.viewId === DASHBOARD_VIEW_ID)!

    act(() => {
      result.current.setActiveTabId(dashboardTab.id)
    })

    expect(result.current.activeTabId).toBe(dashboardTab.id)
    expect(result.current.activeViewId).toBe(DASHBOARD_VIEW_ID)
  })

  it('selectTab is a no-op when already active', () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

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

    const keepTab = result.current.tabs.find(t => t.viewId === 'pr-needs-review')!

    act(() => {
      result.current.closeOtherTabs(keepTab.id)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe('pr-needs-review')
    expect(result.current.activeTabId).toBe(keepTab.id)
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

    const dashboardTab = result.current.tabs[0]!

    act(() => {
      result.current.closeTabsToRight(dashboardTab.id)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe(DASHBOARD_VIEW_ID)
  })

  it('closeTabsToRight moves active tab when it was to the right', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    // Active is copilot-usage (last opened)
    const dashboardTab = result.current.tabs[0]!

    act(() => {
      result.current.closeTabsToRight(dashboardTab.id)
    })

    // Active tab was closed, so it should fall back to the pivot tab
    expect(result.current.activeTabId).toBe(dashboardTab.id)
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

    // Active is pr-needs-review
    act(() => emitTabEvent('tab-close'))

    // dashboard + pr-my-prs remain
    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.activeViewId).toBe('pr-my-prs')
  })

  it('closeActiveTab falls back to dashboard when last non-dashboard tab is closed', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    // Active is pr-my-prs
    act(() => emitTabEvent('tab-close'))

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeViewId).toBe(DASHBOARD_VIEW_ID)
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

    // dashboard + pr-needs-review
    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.tabs.find(t => t.viewId === 'pr-needs-review')).toBeDefined()
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

    const dashboardTab = result.current.tabs.find(t => t.viewId === DASHBOARD_VIEW_ID)!
    const needsReviewTab = result.current.tabs.find(t => t.viewId === 'pr-needs-review')!

    // Active is pr-needs-review
    expect(result.current.activeTabId).toBe(needsReviewTab.id)

    act(() => {
      result.current.closeTab(dashboardTab.id)
    })

    // Active remains pr-needs-review
    expect(result.current.activeTabId).toBe(needsReviewTab.id)
    expect(result.current.tabs).toHaveLength(2)
  })

  it('opens a tab via copilot:open-result event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('copilot:open-result', { detail: { resultId: 'res-42' } })
      )
    })

    await waitFor(() => {
      // dashboard + copilot-result
      expect(result.current.tabs).toHaveLength(2)
    })

    expect(result.current.tabs.find(t => t.viewId === 'copilot-result:res-42')).toBeDefined()
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
      // dashboard + pr-review
      expect(result.current.tabs).toHaveLength(2)
    })

    expect(result.current.tabs.find(t => t.viewId.startsWith('pr-review:'))).toBeDefined()
  })

  it('opens a tab via app:navigate event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: 'copilot-usage' } }))
    })

    await waitFor(() => {
      // dashboard + copilot-usage
      expect(result.current.tabs).toHaveLength(2)
    })

    expect(result.current.tabs.find(t => t.viewId === 'copilot-usage')).toBeDefined()
  })

  it('labels crew-project tabs with project display name', async () => {
    mockListProjects.mockResolvedValue([{ id: 'proj-1', displayName: 'My Project' }])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      const crewTab = result.current.tabs.find(t => t.viewId === 'crew-project:proj-1')
      expect(crewTab!.label).toBe('My Project')
    })
  })

  it('falls back to "PR Detail" label when crew listProjects rejects', async () => {
    mockListProjects.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      // dashboard + crew-project
      expect(result.current.tabs).toHaveLength(2)
    })

    const crewTab = result.current.tabs.find(t => t.viewId === 'crew-project:proj-1')
    expect(crewTab!.label).toBe('PR Detail')
  })
})
