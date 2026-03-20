import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PRReviewInfo } from '../components/PRReviewPanel'
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

export function useAppTabs({ onViewOpen }: UseAppTabsOptions) {
  const [tabState, setTabState] = useState<TabState>({
    tabs: [],
    activeTabId: null,
  })
  const { tabs, activeTabId } = tabState
  const tabsRef = useRef<Tab[]>([])
  const activeTabIdRef = useRef<string | null>(null)
  const nextTabIdRef = useRef(0)

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  const openTab = useCallback(
    async (viewId: string) => {
      onViewOpen(viewId)

      const existingTab = tabsRef.current.find(tab => tab.viewId === viewId)
      if (existingTab) {
        setTabState(previousState => {
          if (previousState.activeTabId === existingTab.id) {
            return previousState
          }

          return {
            ...previousState,
            activeTabId: existingTab.id,
          }
        })
        return
      }

      let label = 'View'
      try {
        label = (await resolveCrewProjectLabel(viewId)) ?? getViewLabel(viewId)
      } catch {
        label = 'PR Detail'
      }

      const newTabId = createTabId(nextTabIdRef)
      setTabState(previousState => {
        const matchingTab = previousState.tabs.find(tab => tab.viewId === viewId)
        if (matchingTab) {
          if (previousState.activeTabId === matchingTab.id) {
            return previousState
          }

          return {
            ...previousState,
            activeTabId: matchingTab.id,
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

  const closeTab = useCallback(
    (tabId: string) => {
      setTabState(previousState => {
        const nextTabs = previousState.tabs.filter(tab => tab.id !== tabId)
        if (nextTabs.length === previousState.tabs.length) {
          return previousState
        }

        if (activeTabIdRef.current === tabId && nextTabs.length > 0) {
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
    },
    []
  )

  const activeViewId = useMemo(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId)
    return activeTab?.viewId ?? null
  }, [activeTabId, tabs])

  const closeView = useCallback(
    (viewId: string) => {
      const tab = tabsRef.current.find(currentTab => currentTab.viewId === viewId)
      if (tab) {
        closeTab(tab.id)
      }
    },
    [closeTab]
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

  return {
    activeTabId,
    activeViewId,
    closeTab,
    closeView,
    openTab,
    setActiveTabId: selectTab,
    tabs,
  }
}
