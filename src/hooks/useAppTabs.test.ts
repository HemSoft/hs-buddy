import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_VIEW_ID, useAppTabs } from './useAppTabs'
import type { Tab } from '../components/TabBar'

const mockListProjects = vi.fn<() => Promise<Array<{ id: string; displayName: string }>>>(
  async () => []
)

function emitTabEvent(name: string) {
  window.dispatchEvent(new Event(`app:${name}`))
}

/** Find a tab by its viewId. */
function findTab(tabs: Tab[], viewId: string) {
  return tabs.find(t => t.viewId === viewId)
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

  it('initialises with a Dashboard tab', () => {
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
      // Dashboard + pr-my-prs (deduplicated)
      expect(result.current.tabs).toHaveLength(2)
    })

    expect(result.current.activeViewId).toBe('pr-my-prs')
    // 3 calls: initial dashboard + 2 openTab('pr-my-prs') calls
    expect(onViewOpen).toHaveBeenCalledTimes(3)
  })

  it('activates the next available tab when closing the active tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    const prMyPrsTab = findTab(result.current.tabs, 'pr-my-prs')!
    const prNeedsReviewTab = findTab(result.current.tabs, 'pr-needs-review')!

    expect(result.current.activeTabId).toBe(prNeedsReviewTab.id)

    act(() => {
      result.current.closeTab(prNeedsReviewTab.id)
    })

    // Dashboard + pr-my-prs remain
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

    // Active is copilot-usage (last opened), which is the last tab
    expect(result.current.activeViewId).toBe('copilot-usage')

    // Next → wraps to first (dashboard)
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

    // Active is pr-needs-review (last opened)
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

    // Only the dashboard tab exists
    const tabId = result.current.activeTabId

    act(() => emitTabEvent('tab-next'))
    expect(result.current.activeTabId).toBe(tabId)

    act(() => emitTabEvent('tab-prev'))
    expect(result.current.activeTabId).toBe(tabId)
  })

  it('closes all tabs and resets active tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    // Dashboard + 2 opened
    expect(result.current.tabs).toHaveLength(3)

    act(() => {
      result.current.closeAllTabs()
    })

    expect(result.current.tabs).toHaveLength(0)
    expect(result.current.activeTabId).toBeNull()
    expect(result.current.activeViewId).toBeNull()
  })

  it('closes other tabs keeping only the specified one', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    const keepTab = findTab(result.current.tabs, 'pr-needs-review')!

    act(() => {
      result.current.closeOtherTabs(keepTab.id)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeTabId).toBe(keepTab.id)
    expect(result.current.activeViewId).toBe('pr-needs-review')
  })

  it('closes tabs to the right of the specified tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    const dashboardTabId = result.current.tabs[0]!.id

    act(() => {
      result.current.closeTabsToRight(dashboardTabId)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeTabId).toBe(dashboardTabId)
  })

  it('adjusts active tab when closing tabs to the right removes the active one', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    // active is copilot-usage (last opened)
    const dashboardTabId = result.current.tabs[0]!.id

    act(() => {
      result.current.closeTabsToRight(dashboardTabId)
    })

    expect(result.current.activeTabId).toBe(dashboardTabId)
  })

  it('selects a tab by ID', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    const prMyPrsTab = findTab(result.current.tabs, 'pr-my-prs')!

    act(() => {
      result.current.setActiveTabId(prMyPrsTab.id)
    })

    expect(result.current.activeTabId).toBe(prMyPrsTab.id)
    expect(result.current.activeViewId).toBe('pr-my-prs')
  })

  it('setActiveTabId is no-op when already active', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const tabId = result.current.activeTabId!
    const tabsBefore = result.current.tabs

    act(() => {
      result.current.setActiveTabId(tabId)
    })

    expect(result.current.tabs).toBe(tabsBefore)
  })

  it('closeView closes a tab by viewId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    act(() => {
      result.current.closeView('pr-my-prs')
    })

    // Dashboard + pr-needs-review remain
    expect(result.current.tabs).toHaveLength(2)
    expect(findTab(result.current.tabs, 'pr-needs-review')).toBeDefined()
    expect(findTab(result.current.tabs, 'pr-my-prs')).toBeUndefined()
  })

  it('closeActiveTab removes the active tab and activates the next', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    // Active is copilot-usage. Select pr-needs-review
    const prNeedsReviewTab = findTab(result.current.tabs, 'pr-needs-review')!
    act(() => {
      result.current.setActiveTabId(prNeedsReviewTab.id)
    })

    act(() => emitTabEvent('tab-close'))

    // Dashboard + pr-my-prs + copilot-usage remain
    expect(result.current.tabs).toHaveLength(3)
    // Should activate the tab that was at the same position
    expect(result.current.activeViewId).toBe('copilot-usage')
  })

  it('closeActiveTab resets to null when last tab is closed', () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    // Close the initial dashboard tab
    act(() => emitTabEvent('tab-close'))

    expect(result.current.tabs).toHaveLength(0)
    expect(result.current.activeTabId).toBeNull()
    expect(result.current.activeViewId).toBeNull()
  })

  it('opens tab via copilot:open-result event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('copilot:open-result', { detail: { resultId: 'res-123' } })
      )
    })

    await waitFor(() => {
      // Dashboard + copilot-result
      expect(findTab(result.current.tabs, 'copilot-result:res-123')).toBeDefined()
    })
    expect(result.current.activeViewId).toBe('copilot-result:res-123')
  })

  it('opens tab via app:navigate event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: 'copilot-usage' } }))
    })

    await waitFor(() => {
      expect(findTab(result.current.tabs, 'copilot-usage')).toBeDefined()
    })
    expect(result.current.activeViewId).toBe('copilot-usage')
  })

  it('does not open tab when copilot:open-result has no resultId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('copilot:open-result', { detail: {} }))
    })

    // Only dashboard tab remains
    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe(DASHBOARD_VIEW_ID)
  })

  it('closeTab is a no-op for non-existent tab ID', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const tabsBefore = result.current.tabs

    act(() => {
      result.current.closeTab('nonexistent-id')
    })

    expect(result.current.tabs).toBe(tabsBefore)
  })

  it('closing a non-active tab preserves the active tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    const prMyPrsTab = findTab(result.current.tabs, 'pr-my-prs')!
    const activeTabId = result.current.activeTabId

    act(() => {
      result.current.closeTab(prMyPrsTab.id)
    })

    // Dashboard + pr-needs-review remain
    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.activeTabId).toBe(activeTabId)
  })

  it('resolves crew project label from window.crew', async () => {
    mockListProjects.mockResolvedValueOnce([{ id: 'proj-1', displayName: 'My Project' }])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      expect(findTab(result.current.tabs, 'crew-project:proj-1')).toBeDefined()
    })
    expect(findTab(result.current.tabs, 'crew-project:proj-1')!.label).toBe('My Project')
  })

  it('falls back to Project Session when crew project is not found', async () => {
    mockListProjects.mockResolvedValueOnce([])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:unknown')
    })

    await waitFor(() => {
      expect(findTab(result.current.tabs, 'crew-project:unknown')).toBeDefined()
    })
    expect(findTab(result.current.tabs, 'crew-project:unknown')!.label).toBe('Project Session')
  })

  it('falls back to PR Detail when label resolution throws', async () => {
    mockListProjects.mockRejectedValueOnce(new Error('crew offline'))

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-err')
    })

    await waitFor(() => {
      expect(findTab(result.current.tabs, 'crew-project:proj-err')).toBeDefined()
    })
    expect(findTab(result.current.tabs, 'crew-project:proj-err')!.label).toBe('PR Detail')
  })

  it('syncs crew tab labels when projects are renamed', async () => {
    mockListProjects.mockResolvedValue([{ id: 'proj-1', displayName: 'Original' }])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      expect(findTab(result.current.tabs, 'crew-project:proj-1')?.label).toBe('Original')
    })

    // Update the project name
    mockListProjects.mockResolvedValue([{ id: 'proj-1', displayName: 'Renamed' }])

    // Open another crew tab to trigger the dependency change
    await act(async () => {
      await result.current.openTab('crew-project:proj-2')
    })

    await waitFor(() => {
      const proj1Tab = findTab(result.current.tabs, 'crew-project:proj-1')
      expect(proj1Tab?.label).toBe('Renamed')
    })
  })

  it('opens tab via pr-review:open event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    const prReviewInfo = { prUrl: 'https://github.com/org/repo/pull/1' }

    await act(async () => {
      window.dispatchEvent(new CustomEvent('pr-review:open', { detail: prReviewInfo }))
    })

    await waitFor(() => {
      const prReviewTab = result.current.tabs.find(t => t.viewId.startsWith('pr-review:'))
      expect(prReviewTab).toBeDefined()
    })
    expect(result.current.activeViewId).toContain('pr-review:')
  })

  it('closeActiveTab is no-op when no active tab', () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    // Close the default Dashboard tab first to reach a state with no active tab
    act(() => emitTabEvent('tab-close'))
    expect(result.current.tabs).toHaveLength(0)

    const tabsBefore = result.current.tabs

    act(() => emitTabEvent('tab-close'))

    expect(result.current.tabs).toBe(tabsBefore)
  })

  it('does not open tab when pr-review:open has no prUrl', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('pr-review:open', { detail: {} }))
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe(DASHBOARD_VIEW_ID)
  })

  it('does not open tab when app:navigate has no viewId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: {} }))
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe(DASHBOARD_VIEW_ID)
  })

  it('closeView is no-op for non-existent viewId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const tabsBefore = result.current.tabs

    act(() => {
      result.current.closeView('nonexistent-view')
    })

    expect(result.current.tabs).toBe(tabsBefore)
  })

  describe('onViewClose callback', () => {
    it('fires onViewClose when closing a tab', async () => {
      const onViewClose = vi.fn()
      const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn(), onViewClose }))

      await act(async () => {
        await result.current.openTab('pr-my-prs')
      })

      const tab = findTab(result.current.tabs, 'pr-my-prs')!

      act(() => {
        result.current.closeTab(tab.id)
      })

      await waitFor(() => {
        expect(onViewClose).toHaveBeenCalledWith('pr-my-prs')
      })
    })

    it('fires onViewClose for each tab when closing others', async () => {
      const onViewClose = vi.fn()
      const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn(), onViewClose }))

      await act(async () => {
        await result.current.openTab('pr-my-prs')
        await result.current.openTab('pr-needs-review')
        await result.current.openTab('copilot-usage')
      })

      const keepTab = findTab(result.current.tabs, 'pr-my-prs')!

      act(() => {
        result.current.closeOtherTabs(keepTab.id)
      })

      await waitFor(() => {
        expect(onViewClose).toHaveBeenCalledTimes(3)
      })
    })

    it('fires onViewClose for tabs to the right', async () => {
      const onViewClose = vi.fn()
      const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn(), onViewClose }))

      await act(async () => {
        await result.current.openTab('pr-my-prs')
        await result.current.openTab('pr-needs-review')
        await result.current.openTab('copilot-usage')
      })

      const prMyPrsTab = findTab(result.current.tabs, 'pr-my-prs')!

      act(() => {
        result.current.closeTabsToRight(prMyPrsTab.id)
      })

      await waitFor(() => {
        expect(onViewClose).toHaveBeenCalledWith('pr-needs-review')
        expect(onViewClose).toHaveBeenCalledWith('copilot-usage')
      })
    })

    it('fires onViewClose for all tabs when closing all', async () => {
      const onViewClose = vi.fn()
      const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn(), onViewClose }))

      await act(async () => {
        await result.current.openTab('pr-my-prs')
      })

      act(() => {
        result.current.closeAllTabs()
      })

      await waitFor(() => {
        // Dashboard + pr-my-prs
        expect(onViewClose).toHaveBeenCalledTimes(2)
      })
    })

    it('fires onViewClose when closing active tab via event', async () => {
      const onViewClose = vi.fn()
      const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn(), onViewClose }))

      await act(async () => {
        await result.current.openTab('pr-my-prs')
      })

      act(() => emitTabEvent('tab-close'))

      await waitFor(() => {
        expect(onViewClose).toHaveBeenCalledWith('pr-my-prs')
      })
    })
  })

  it('closeOtherTabs is no-op for non-existent keepTabId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const tabsBefore = result.current.tabs

    act(() => {
      result.current.closeOtherTabs('nonexistent-id')
    })

    expect(result.current.tabs).toBe(tabsBefore)
  })

  it('closeTabsToRight is no-op for non-existent tabId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

    const tabsBefore = result.current.tabs

    act(() => {
      result.current.closeTabsToRight('nonexistent-id')
    })

    expect(result.current.tabs).toBe(tabsBefore)
  })

  it('syncCrewTabLabels returns same state when no labels change', async () => {
    // First call for openTab's resolveCrewProjectLabel, second for syncCrewTabLabels
    mockListProjects.mockResolvedValue([{ id: 'proj-1', displayName: 'Stable Label' }])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      expect(findTab(result.current.tabs, 'crew-project:proj-1')?.label).toBe('Stable Label')
    })

    // Force the effect to re-run by opening another crew tab
    mockListProjects.mockResolvedValue([
      { id: 'proj-1', displayName: 'Stable Label' },
      { id: 'proj-x', displayName: 'X' },
    ])

    await act(async () => {
      await result.current.openTab('crew-project:proj-x')
    })

    await waitFor(() => {
      expect(findTab(result.current.tabs, 'crew-project:proj-x')).toBeDefined()
    })

    // proj-1 label should remain unchanged
    expect(findTab(result.current.tabs, 'crew-project:proj-1')?.label).toBe('Stable Label')
  })

  it('falls back to timestamp-based tab ID when crypto.randomUUID is unavailable', async () => {
    const originalRandomUUID = crypto.randomUUID
    // Remove randomUUID to trigger the fallback branch
    Object.defineProperty(crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    try {
      const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

      await act(async () => {
        await result.current.openTab('pr-my-prs')
      })

      const tab = findTab(result.current.tabs, 'pr-my-prs')
      expect(tab).toBeDefined()
      // Fallback generates: `tab-${Date.now()}-${counter}`
      expect(tab!.id).toMatch(/^tab-\d+-\d+$/)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', {
        value: originalRandomUUID,
        configurable: true,
        writable: true,
      })
    }
  })

  describe('branch coverage', () => {
    it('uses PR Detail fallback label when resolveCrewProjectLabel throws', async () => {
      const onViewOpen = vi.fn()
      const { result } = renderHook(() => useAppTabs({ onViewOpen }))

      mockListProjects.mockRejectedValue(new Error('Network error'))

      await act(async () => {
        await result.current.openTab('crew-project:proj-1')
      })

      const tab = findTab(result.current.tabs, 'crew-project:proj-1')
      expect(tab?.label).toBe('PR Detail')
    })

    it('does not open tab when copilot:open-result event has no resultId', async () => {
      const onViewOpen = vi.fn()
      const { result } = renderHook(() => useAppTabs({ onViewOpen }))

      const tabsBefore = result.current.tabs

      act(() => {
        window.dispatchEvent(new CustomEvent('copilot:open-result', { detail: {} }))
      })

      await waitFor(() => {
        expect(result.current.tabs).toBe(tabsBefore)
      })
    })

    it('returns unchanged state when closeOtherTabs called with non-existent keepTabId', async () => {
      const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

      await act(async () => {
        await result.current.openTab('pr-my-prs')
        await result.current.openTab('pr-needs-review')
      })

      const tabsBefore = result.current.tabs

      act(() => {
        result.current.closeOtherTabs('fake-id')
      })

      expect(result.current.tabs).toBe(tabsBefore)
    })
  })
})
