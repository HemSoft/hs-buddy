import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PRReviewInfo } from '../components/pr-review/PRReviewInfo'
import type { Tab } from '../components/TabBar'
import { getViewLabel } from '../components/appContentViewLabels'

async function resolveCrewProjectLabel(viewId: string): Promise<string | null> {
  if (!viewId.startsWith('crew-project:')) {
    return null
  }

  const projectId = viewId.replace('crew-project:', '')
  const projects = await window.crew.listProjects()
  return projects.find(project => project.id === projectId)?.displayName ?? 'Project Session'
}

function createTabId(nextTabIdRef: { current: number }): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tab-${crypto.randomUUID()}`
  }

  nextTabIdRef.current += 1
  return `tab-${Date.now()}-${nextTabIdRef.current}`
}

interface UseAppTabsOptions {
  onViewOpen: (viewId: string) => void
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
}

export const DASHBOARD_VIEW_ID = 'dashboard'

export function useAppTabs({ onViewOpen }: UseAppTabsOptions) {
  const [tabState, setTabState] = useState<TabState>(() => {
    const dashboardTab: Tab = {
      id: 'tab-dashboard',
      label: 'Dashboard',
      viewId: DASHBOARD_VIEW_ID,
    }
    return {
      tabs: [dashboardTab],
      activeTabId: dashboardTab.id,
    }
  })
  const { tabs, activeTabId } = tabState
  const nextTabIdRef = useRef(0)

  // Fire analytics for the initial dashboard tab
  const onViewOpenRef = useRef(onViewOpen)
  onViewOpenRef.current = onViewOpen
  useEffect(() => {
    onViewOpenRef.current(DASHBOARD_VIEW_ID)
  }, [])

  const openTab = useCallback(
    async (viewId: string) => {
      onViewOpen(viewId)

      let label = 'View'
      try {
        label = (await resolveCrewProjectLabel(viewId)) ?? getViewLabel(viewId)
      } catch {
        label = 'PR Detail'
      }

      const newTabId = createTabId(nextTabIdRef)
      setTabState(previousState => {
        const existingTab = previousState.tabs.find(tab => tab.viewId === viewId)
        if (existingTab) {
          if (previousState.activeTabId === existingTab.id) {
            return previousState
          }

          return {
            ...previousState,
            activeTabId: existingTab.id,
          }
        }

        const newTab: Tab = {
          id: newTabId,
          label,
          viewId,
        }

        return {
          tabs: [...previousState.tabs, newTab],
          activeTabId: newTabId,
        }
      })
    },
    [onViewOpen]
  )

  const crewTabDependency = useMemo(() => {
    const crewTabViewIds = tabs
      .filter(tab => tab.viewId.startsWith('crew-project:'))
      .map(tab => tab.viewId)
      .sort()

    return crewTabViewIds.join('|')
  }, [tabs])

  useEffect(() => {
    if (!crewTabDependency) {
      return
    }

    let isCancelled = false

    const syncCrewTabLabels = async () => {
      const projects = await window.crew.listProjects()
      if (isCancelled) {
        return
      }

      const labelsById = new Map(projects.map(project => [project.id, project.displayName]))
      setTabState(currentState => {
        let hasChanges = false
        const nextTabs = currentState.tabs.map(tab => {
          if (!tab.viewId.startsWith('crew-project:')) {
            return tab
          }

          const projectId = tab.viewId.replace('crew-project:', '')
          const nextLabel = labelsById.get(projectId) ?? tab.label
          if (nextLabel === tab.label) {
            return tab
          }

          hasChanges = true
          return { ...tab, label: nextLabel }
        })

        return hasChanges
          ? {
              ...currentState,
              tabs: nextTabs,
            }
          : currentState
      })
    }

    syncCrewTabLabels().catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [crewTabDependency])

  useEffect(() => {
    const handleCopilotResultOpen = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.resultId) {
        openTab(`copilot-result:${detail.resultId}`)
      }
    }

    window.addEventListener('copilot:open-result', handleCopilotResultOpen)
    return () => window.removeEventListener('copilot:open-result', handleCopilotResultOpen)
  }, [openTab])

  useEffect(() => {
    const handlePRReviewOpen = (event: Event) => {
      const detail = (event as CustomEvent).detail as PRReviewInfo | undefined
      if (detail?.prUrl) {
        const encoded = encodeURIComponent(JSON.stringify(detail))
        openTab(`pr-review:${encoded}`)
      }
    }

    window.addEventListener('pr-review:open', handlePRReviewOpen)
    return () => window.removeEventListener('pr-review:open', handlePRReviewOpen)
  }, [openTab])

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ viewId?: string }>).detail
      if (detail?.viewId) {
        openTab(detail.viewId)
      }
    }

    window.addEventListener('app:navigate', handleNavigate)
    return () => window.removeEventListener('app:navigate', handleNavigate)
  }, [openTab])

  const closeTab = useCallback((tabId: string) => {
    setTabState(previousState => {
      const nextTabs = previousState.tabs.filter(tab => tab.id !== tabId)
      if (nextTabs.length === previousState.tabs.length) {
        return previousState
      }

      if (previousState.activeTabId === tabId && nextTabs.length > 0) {
        const closedIndex = previousState.tabs.findIndex(tab => tab.id === tabId)
        const nextActiveIndex = Math.min(closedIndex, nextTabs.length - 1)
        return {
          tabs: nextTabs,
          activeTabId: nextTabs[Math.max(0, nextActiveIndex)]?.id || null,
        }
      }

      return {
        tabs: nextTabs,
        activeTabId: nextTabs.length === 0 ? null : previousState.activeTabId,
      }
    })
  }, [])

  const activeViewId = useMemo(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId)
    return activeTab?.viewId ?? null
  }, [activeTabId, tabs])

  const closeView = useCallback(
    (viewId: string) => {
      const tab = tabs.find(currentTab => currentTab.viewId === viewId)
      if (tab) {
        closeTab(tab.id)
      }
    },
    [closeTab, tabs]
  )

  const selectTab = useCallback((tabId: string) => {
    setTabState(previousState => {
      if (previousState.activeTabId === tabId) {
        return previousState
      }

      return {
        ...previousState,
        activeTabId: tabId,
      }
    })
  }, [])

  const closeOtherTabs = useCallback((keepTabId: string) => {
    setTabState(previousState => {
      const kept = previousState.tabs.filter(tab => tab.id === keepTabId)
      if (kept.length === 0) return previousState
      return { tabs: kept, activeTabId: keepTabId }
    })
  }, [])

  const closeTabsToRight = useCallback((tabId: string) => {
    setTabState(previousState => {
      const index = previousState.tabs.findIndex(tab => tab.id === tabId)
      if (index === -1) return previousState
      const kept = previousState.tabs.slice(0, index + 1)
      const activeStillOpen = kept.some(tab => tab.id === previousState.activeTabId)
      return {
        tabs: kept,
        activeTabId: activeStillOpen ? previousState.activeTabId : tabId,
      }
    })
  }, [])

  const closeAllTabs = useCallback(() => {
    setTabState({ tabs: [], activeTabId: null })
  }, [])

  const selectNextTab = useCallback(() => {
    setTabState(prev => {
      if (prev.tabs.length <= 1) return prev
      const idx = prev.tabs.findIndex(t => t.id === prev.activeTabId)
      const next = (idx + 1) % prev.tabs.length
      return { ...prev, activeTabId: prev.tabs[next].id }
    })
  }, [])

  const selectPrevTab = useCallback(() => {
    setTabState(prev => {
      if (prev.tabs.length <= 1) return prev
      const idx = prev.tabs.findIndex(t => t.id === prev.activeTabId)
      const next = (idx - 1 + prev.tabs.length) % prev.tabs.length
      return { ...prev, activeTabId: prev.tabs[next].id }
    })
  }, [])

  const closeActiveTab = useCallback(() => {
    setTabState(prev => {
      if (!prev.activeTabId || prev.tabs.length === 0) return prev
      const nextTabs = prev.tabs.filter(t => t.id !== prev.activeTabId)
      if (nextTabs.length === 0) return { tabs: [], activeTabId: null }
      const closedIndex = prev.tabs.findIndex(t => t.id === prev.activeTabId)
      const nextActiveIndex = Math.min(closedIndex, nextTabs.length - 1)
      return { tabs: nextTabs, activeTabId: nextTabs[Math.max(0, nextActiveIndex)]?.id || null }
    })
  }, [])

  useEffect(() => {
    // DOM event path only — IPC-to-DOM bridging lives in main.tsx (registered once, no cleanup needed)
    window.addEventListener('app:tab-next', selectNextTab)
    window.addEventListener('app:tab-prev', selectPrevTab)
    window.addEventListener('app:tab-close', closeActiveTab)
    return () => {
      window.removeEventListener('app:tab-next', selectNextTab)
      window.removeEventListener('app:tab-prev', selectPrevTab)
      window.removeEventListener('app:tab-close', closeActiveTab)
    }
  }, [selectNextTab, selectPrevTab, closeActiveTab])

  return {
    activeTabId,
    activeViewId,
    closeAllTabs,
    closeOtherTabs,
    closeTab,
    closeTabsToRight,
    closeView,
    openTab,
    setActiveTabId: selectTab,
    tabs,
  }
}
