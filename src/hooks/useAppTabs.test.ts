import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppTabs } from './useAppTabs'

const mockListProjects = vi.fn(async () => [])

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

  it('closes all tabs and resets active tab', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
    })

    expect(result.current.tabs).toHaveLength(2)

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

    const keepTabId = result.current.tabs[1]!.id

    act(() => {
      result.current.closeOtherTabs(keepTabId)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeTabId).toBe(keepTabId)
    expect(result.current.activeViewId).toBe('pr-needs-review')
  })

  it('closes tabs to the right of the specified tab', async () => {
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
    expect(result.current.activeTabId).toBe(firstTabId)
  })

  it('adjusts active tab when closing tabs to the right removes the active one', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    // active is copilot-usage (last opened)
    const firstTabId = result.current.tabs[0]!.id

    act(() => {
      result.current.closeTabsToRight(firstTabId)
    })

    expect(result.current.activeTabId).toBe(firstTabId)
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

    // Should be the same reference (no state update)
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

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0]!.viewId).toBe('pr-needs-review')
  })

  it('closeActiveTab removes the active tab and activates the next', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
      await result.current.openTab('pr-needs-review')
      await result.current.openTab('copilot-usage')
    })

    // Active is copilot-usage. Select middle tab
    const middleTabId = result.current.tabs[1]!.id
    act(() => {
      result.current.setActiveTabId(middleTabId)
    })

    act(() => emitTabEvent('tab-close'))

    expect(result.current.tabs).toHaveLength(2)
    // Should activate the tab that was at the same position
    expect(result.current.activeViewId).toBe('copilot-usage')
  })

  it('closeActiveTab resets to null when last tab is closed', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('pr-my-prs')
    })

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
      expect(result.current.tabs).toHaveLength(1)
    })
    expect(result.current.activeViewId).toBe('copilot-result:res-123')
  })

  it('opens tab via app:navigate event', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: 'copilot-usage' } }))
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })
    expect(result.current.activeViewId).toBe('copilot-usage')
  })

  it('does not open tab when copilot:open-result has no resultId', async () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      window.dispatchEvent(new CustomEvent('copilot:open-result', { detail: {} }))
    })

    expect(result.current.tabs).toHaveLength(0)
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

    const firstTabId = result.current.tabs[0]!.id
    const activeTabId = result.current.activeTabId

    act(() => {
      result.current.closeTab(firstTabId)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.activeTabId).toBe(activeTabId)
  })

  it('resolves crew project label from window.crew', async () => {
    mockListProjects.mockResolvedValueOnce([
      { id: 'proj-1', displayName: 'My Project' },
    ])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })
    expect(result.current.tabs[0]!.label).toBe('My Project')
  })

  it('falls back to Project Session when crew project is not found', async () => {
    mockListProjects.mockResolvedValueOnce([])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:unknown')
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })
    expect(result.current.tabs[0]!.label).toBe('Project Session')
  })

  it('falls back to PR Detail when label resolution throws', async () => {
    mockListProjects.mockRejectedValueOnce(new Error('crew offline'))

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-err')
    })

    await waitFor(() => {
      expect(result.current.tabs).toHaveLength(1)
    })
    expect(result.current.tabs[0]!.label).toBe('PR Detail')
  })

  it('syncs crew tab labels when projects are renamed', async () => {
    mockListProjects.mockResolvedValue([
      { id: 'proj-1', displayName: 'Original' },
    ])

    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    await act(async () => {
      await result.current.openTab('crew-project:proj-1')
    })

    await waitFor(() => {
      expect(result.current.tabs[0]!.label).toBe('Original')
    })

    // Update the project name
    mockListProjects.mockResolvedValue([
      { id: 'proj-1', displayName: 'Renamed' },
    ])

    // Open another crew tab to trigger the dependency change
    await act(async () => {
      await result.current.openTab('crew-project:proj-2')
    })

    await waitFor(() => {
      const proj1Tab = result.current.tabs.find(t => t.viewId === 'crew-project:proj-1')
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
      expect(result.current.tabs).toHaveLength(1)
    })
    expect(result.current.activeViewId).toContain('pr-review:')
  })

  it('closeActiveTab is no-op when no active tab', () => {
    const { result } = renderHook(() => useAppTabs({ onViewOpen: vi.fn() }))

    const tabsBefore = result.current.tabs

    act(() => emitTabEvent('tab-close'))

    expect(result.current.tabs).toBe(tabsBefore)
  })
})
