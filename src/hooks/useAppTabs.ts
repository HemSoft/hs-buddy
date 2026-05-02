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
  onViewClose?: (viewId: string) => void
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  pendingCloses: string[]
}

export const DASHBOARD_VIEW_ID = 'dashboard'

function resolveActiveTabAfterClose(
  previousState: TabState,
  tabId: string,
  nextTabs: Tab[]
): string | null {
  if (previousState.activeTabId === tabId && nextTabs.length > 0) {
    const closedIndex = previousState.tabs.findIndex(tab => tab.id === tabId)
    const nextActiveIndex = Math.min(closedIndex, nextTabs.length - 1)
    /* v8 ignore start */
    return nextTabs[Math.max(0, nextActiveIndex)]?.id || null
    /* v8 ignore stop */
  }
  /* v8 ignore start */
  return nextTabs.length === 0 ? null : previousState.activeTabId
  /* v8 ignore stop */
}

export function useAppTabs({ onViewOpen, onViewClose }: UseAppTabsOptions) {
  const [tabState, setTabState] = useState<TabState>(() => {
    const dashboardTab: Tab = {
      id: 'tab-dashboard',
      label: 'Dashboard',
      viewId: DASHBOARD_VIEW_ID,
    }
    return {
      tabs: [dashboardTab],
      activeTabId: dashboardTab.id,
      pendingCloses: [],
    }
  })
  const { tabs, activeTabId } = tabState
  const nextTabIdRef = useRef(0)

  // Stable ref so callbacks can read latest onViewClose without dep-array churn
  const onViewCloseRef = useRef(onViewClose)
  onViewCloseRef.current = onViewClose

  // Fire analytics for the initial dashboard tab
  const onViewOpenRef = useRef(onViewOpen)
  onViewOpenRef.current = onViewOpen
  useEffect(() => {
    onViewOpenRef.current(DASHBOARD_VIEW_ID)
  }, [])

  // Flush pending onViewClose callbacks after every state commit.
  // pendingCloses lives in state so updaters stay pure (safe under StrictMode).
  useEffect(() => {
    if (tabState.pendingCloses.length === 0) return
    const cb = onViewCloseRef.current
    if (cb) {
      for (const viewId of tabState.pendingCloses) cb(viewId)
    }
    /* v8 ignore start */
    setTabState(prev => (prev.pendingCloses.length === 0 ? prev : { ...prev, pendingCloses: [] }))
    /* v8 ignore stop */
  }, [tabState.pendingCloses])

  const openTab = useCallback(
    async (viewId: string) => {
      onViewOpen(viewId)

      let label = 'View'
      try {
        label = (await resolveCrewProjectLabel(viewId)) ?? getViewLabel(viewId)
      } catch (_: unknown) {
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
          pendingCloses: previousState.pendingCloses,
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

      const closedViewId = previousState.tabs.find(tab => tab.id === tabId)?.viewId
      /* v8 ignore start */
      const pendingCloses = closedViewId ? [closedViewId] : []
      /* v8 ignore stop */

      return {
        tabs: nextTabs,
        activeTabId: resolveActiveTabAfterClose(previousState, tabId, nextTabs),
        pendingCloses,
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
      if (!previousState.tabs.some(tab => tab.id === keepTabId)) return previousState
      const kept = previousState.tabs.filter(tab => tab.id === keepTabId)
      /* v8 ignore start */
      if (kept.length === 0) return previousState
      /* v8 ignore stop */
      const closed = previousState.tabs.filter(tab => tab.id !== keepTabId).map(tab => tab.viewId)
      return { tabs: kept, activeTabId: keepTabId, pendingCloses: closed }
    })
  }, [])

  const closeTabsToRight = useCallback((tabId: string) => {
    setTabState(previousState => {
      const idx = previousState.tabs.findIndex(tab => tab.id === tabId)
      if (idx === -1) return previousState
      const closed = previousState.tabs.slice(idx + 1).map(tab => tab.viewId)
      /* v8 ignore start */
      if (closed.length === 0) return previousState
      /* v8 ignore stop */
      const kept = previousState.tabs.slice(0, idx + 1)
      const activeStillOpen = kept.some(tab => tab.id === previousState.activeTabId)
      return {
        tabs: kept,
        /* v8 ignore start */
        activeTabId: activeStillOpen ? previousState.activeTabId : tabId,
        /* v8 ignore stop */
        pendingCloses: closed,
      }
    })
  }, [])

  const closeAllTabs = useCallback(() => {
    setTabState(previousState => {
      const closed = previousState.tabs.map(tab => tab.viewId)
      return { tabs: [], activeTabId: null, pendingCloses: closed }
    })
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
      const closedViewId = prev.tabs.find(t => t.id === prev.activeTabId)?.viewId
      /* v8 ignore start */
      const pendingCloses = closedViewId ? [closedViewId] : []
      /* v8 ignore stop */
      const nextTabs = prev.tabs.filter(t => t.id !== prev.activeTabId)
      const activeTabId = resolveActiveTabAfterClose(prev, prev.activeTabId, nextTabs)
      return { tabs: nextTabs, activeTabId, pendingCloses }
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
