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
})
