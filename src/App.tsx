import { useState, useCallback, useRef, useEffect } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { TitleBar } from './components/TitleBar'
import { ActivityBar } from './components/ActivityBar'
import { SidebarPanel } from './components/SidebarPanel'
import { TabBar, Tab } from './components/TabBar'
import { ScheduleEditor, JobEditor } from './components/automation'
import { StatusBar } from './components/StatusBar'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AppContentRouter } from './components/AppContentRouter'
import { AssistantPanel } from './components/AssistantPanel'
import { getViewLabel } from './components/appContentViewLabels'
import type { PRReviewInfo } from './components/PRReviewPanel'
import { useSchedules, useJobs, useBuddyStatsMutations } from './hooks/useConvex'
import { useMigrateToConvex } from './hooks/useMigration'
import { usePrefetch } from './hooks/usePrefetch'
import { useBackgroundStatus } from './hooks/useBackgroundStatus'
import { useAppAppearance } from './hooks/useAppAppearance'
import { usePRSidebarBadges } from './hooks/usePRSidebarBadges'
import { useAssistantContext } from './hooks/useAssistantContext'
import { GitHubClient } from './api/github'
import { normalizePaneSizes, DEFAULT_PANE_SIZES, DEFAULT_ASSISTANT_PANE_SIZE } from './appUtils'
import './App.css'

const UPTIME_CHECKPOINT_MS = 5 * 60 * 1000
const CLI_ACCOUNT_POLL_MS = 30_000
const PANE_SAVE_DEBOUNCE_MS = 300

async function resolveCrewProjectLabel(viewId: string): Promise<string | null> {
  if (!viewId.startsWith('crew-project:')) {
    return null
  }

  const projectId = viewId.replace('crew-project:', '')
  const projects = await window.crew.listProjects()
  return projects.find(project => project.id === projectId)?.displayName ?? 'Project Session'
}

interface LayoutState {
  paneSizes: number[]
  assistantOpen: boolean
}

function App() {
  const [selectedSection, setSelectedSection] = useState<string>('github')
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const { prCounts, badgeProgress, setPRCount } = usePRSidebarBadges()

  // Create triggers for automation items (from sidebar context menu)
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false)
  const [jobEditorOpen, setJobEditorOpen] = useState(false)

  // Pane sizes (persisted to electron-store via IPC)
  const [layoutState, setLayoutState] = useState<LayoutState>({
    paneSizes: [...DEFAULT_PANE_SIZES],
    assistantOpen: false,
  })
  const { paneSizes, assistantOpen } = layoutState
  const paneSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Get schedule and job counts from Convex for status bar
  const schedules = useSchedules()
  const jobs = useJobs()

  // One-time migration from electron-store to Convex
  const { isComplete: migrationComplete, isLoading: migrationLoading } = useMigrateToConvex()

  // Prefetch PR data in background on app startup
  usePrefetch()

  // Apply appearance config (theme/accent/colors/fonts)
  useAppAppearance()

  // Background sync status for StatusBar
  const backgroundStatus = useBackgroundStatus()

  // Buddy stats mutations (for tracking usage)
  const {
    increment: incrementStat,
    recordSessionStart,
    recordSessionEnd,
    checkpointUptime,
  } = useBuddyStatsMutations()
  const incrementStatRef = useRef(incrementStat)
  useEffect(() => {
    incrementStatRef.current = incrementStat
  }, [incrementStat])

  // Session lifecycle — record start, periodic checkpoint, end on unload
  // NOTE: Do NOT call recordSessionEnd in the cleanup function!
  // React Strict Mode (and HMR) runs effects as mount→cleanup→remount.
  // The cleanup's recordSessionEnd() would clear lastSessionStart, and
  // the ref guard would prevent re-calling recordSessionStart on remount,
  // leaving lastSessionStart permanently undefined (uptime stuck at 0m).
  useEffect(() => {
    recordSessionStart().catch(() => {})

    // Periodic uptime checkpoint every 5 minutes (guards against crashes)
    const checkpointTimer = setInterval(() => {
      checkpointUptime().catch(() => {})
    }, UPTIME_CHECKPOINT_MS)

    // Flush uptime on window close
    const handleBeforeUnload = () => {
      recordSessionEnd().catch(() => {})
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(checkpointTimer)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Do NOT call recordSessionEnd here — see note above
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track the active GitHub CLI account (for Copilot CLI credit transparency)
  const [activeGitHubAccount, setActiveGitHubAccount] = useState<string | null>(null)
  useEffect(() => {
    GitHubClient.getActiveCliAccount()
      .then(setActiveGitHubAccount)
      .catch(() => {})
    // Re-check every 30 seconds in case user switches account externally
    const timer = setInterval(() => {
      GitHubClient.getActiveCliAccount()
        .then(setActiveGitHubAccount)
        .catch(() => {})
    }, CLI_ACCOUNT_POLL_MS)
    return () => clearInterval(timer)
  }, [])

  // Load pane sizes from electron-store on mount
  useEffect(() => {
    let isCancelled = false

    Promise.allSettled([
      window.ipcRenderer.invoke('config:get-pane-sizes') as Promise<number[]>,
      window.ipcRenderer.invoke('config:get-assistant-open') as Promise<boolean>,
    ]).then(([paneSizesResult, assistantOpenResult]) => {
      if (isCancelled) {
        return
      }

      const nextPaneSizes =
        paneSizesResult.status === 'fulfilled'
          ? normalizePaneSizes(paneSizesResult.value)
          : [...DEFAULT_PANE_SIZES]

      const nextAssistantOpen =
        assistantOpenResult.status === 'fulfilled' && typeof assistantOpenResult.value === 'boolean'
          ? assistantOpenResult.value
          : false

      setLayoutState({
        paneSizes: nextPaneSizes,
        assistantOpen: nextAssistantOpen,
      })
    })

    return () => {
      isCancelled = true
    }
  }, [])

  // Save pane sizes when changed (debounced)
  const handlePaneChange = useCallback((sizes: number[]) => {
    // Only save if we have valid sizes (2 or 3 panes)
    if (sizes.length >= 2 && sizes.every(s => s > 0)) {
      setLayoutState(currentState => ({
        ...currentState,
        paneSizes: sizes,
      }))
      // Debounce saving to electron-store
      if (paneSaveTimeoutRef.current) {
        clearTimeout(paneSaveTimeoutRef.current)
      }
      paneSaveTimeoutRef.current = setTimeout(() => {
        window.ipcRenderer.invoke('config:set-pane-sizes', sizes)
      }, PANE_SAVE_DEBOUNCE_MS)
    }
  }, [])

  // Open a new tab or activate existing one
  const openTab = useCallback(
    async (viewId: string) => {
      // Track stat increments (fire-and-forget)
      incrementStatRef.current({ field: 'tabsOpened' }).catch(() => {})
      const prStatMap: Record<string, string> = {
        'pr-my-prs': 'prsViewed',
        'pr-needs-review': 'prsReviewed',
        'pr-recently-merged': 'prsMergedWatched',
      }
      const statField = prStatMap[viewId]
      if (statField) {
        incrementStatRef.current({ field: statField }).catch(() => {})
      }

      // Check if tab already exists
      const existingTab = tabs.find(t => t.viewId === viewId)
      if (existingTab) {
        // Activate existing tab
        setActiveTabId(existingTab.id)
        return
      }

      // Create new tab
      let label = 'View'
      try {
        label = (await resolveCrewProjectLabel(viewId)) ?? getViewLabel(viewId)
      } catch {
        label = 'PR Detail'
      }

      const newTab: Tab = {
        id: `tab-${Date.now()}`,
        label,
        viewId,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(newTab.id)
    },
    [tabs]
  )

  useEffect(() => {
    const crewTabs = tabs.filter(tab => tab.viewId.startsWith('crew-project:'))
    if (crewTabs.length === 0) {
      return
    }

    let isCancelled = false

    const syncCrewTabLabels = async () => {
      const projects = await window.crew.listProjects()
      if (isCancelled) {
        return
      }

      const labelsById = new Map(projects.map(project => [project.id, project.displayName]))
      setTabs(currentTabs => {
        let hasChanges = false
        const nextTabs = currentTabs.map(tab => {
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

        return hasChanges ? nextTabs : currentTabs
      })
    }

    syncCrewTabLabels().catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [tabs])

  // Listen for copilot:open-result custom events (from PR context menus, prompt box, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.resultId) {
        openTab(`copilot-result:${detail.resultId}`)
      }
    }
    window.addEventListener('copilot:open-result', handler)
    return () => window.removeEventListener('copilot:open-result', handler)
  }, [openTab])

  // Listen for pr-review:open custom events (from PR context menus)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as PRReviewInfo | undefined
      if (detail?.prUrl) {
        const encoded = encodeURIComponent(JSON.stringify(detail))
        openTab(`pr-review:${encoded}`)
      }
    }
    window.addEventListener('pr-review:open', handler)
    return () => window.removeEventListener('pr-review:open', handler)
  }, [openTab])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ viewId?: string }>).detail
      if (detail?.viewId) {
        openTab(detail.viewId)
      }
    }
    window.addEventListener('app:navigate', handler)
    return () => window.removeEventListener('app:navigate', handler)
  }, [openTab])

  // Close a tab
  const closeTab = useCallback(
    (tabId: string) => {
      setTabs(prev => {
        const newTabs = prev.filter(t => t.id !== tabId)

        // If we closed the active tab, activate another one
        if (activeTabId === tabId && newTabs.length > 0) {
          // Find index of closed tab in original array
          const closedIndex = prev.findIndex(t => t.id === tabId)
          // Prefer tab to the left, otherwise first tab
          const newActiveIndex = Math.min(closedIndex, newTabs.length - 1)
          setActiveTabId(newTabs[Math.max(0, newActiveIndex)]?.id || null)
        } else if (newTabs.length === 0) {
          setActiveTabId(null)
        }

        return newTabs
      })
    },
    [activeTabId]
  )

  const handlePRCountChange = useCallback(
    (viewId: string, count: number) => {
      setPRCount(viewId, count)
    },
    [setPRCount]
  )

  // Handle creating new items from sidebar context menu
  const handleCreateNew = useCallback((type: 'schedule' | 'job') => {
    if (type === 'schedule') {
      setScheduleEditorOpen(true)
    } else {
      // Open the JobEditor modal directly (no Jobs list page)
      setJobEditorOpen(true)
    }
  }, [])

  const handleSectionSelect = (sectionId: string) => {
    setSelectedSection(sectionId)
    // Don't auto-open tabs - let user click in sidebar
  }

  const handleItemSelect = (viewId: string) => {
    openTab(viewId)
  }

  // Get active tab's viewId
  const activeTab = tabs.find(t => t.id === activeTabId)
  const activeViewId = activeTab?.viewId || null

  // Assistant context derived from active view
  const assistantContext = useAssistantContext(activeViewId)

  // Toggle assistant panel
  const toggleAssistant = useCallback(() => {
    setLayoutState(currentState => {
      const next = !currentState.assistantOpen
      window.ipcRenderer.invoke('config:set-assistant-open', next).catch(() => {})
      return {
        ...currentState,
        assistantOpen: next,
      }
    })
  }, [])

  // Listen for IPC 'toggle-assistant' from main process (Ctrl+Shift+A shortcut)
  useEffect(() => {
    window.ipcRenderer.on('toggle-assistant', toggleAssistant)
    return () => {
      window.ipcRenderer.off('toggle-assistant', toggleAssistant)
    }
  }, [toggleAssistant])

  // Keyboard shortcut fallback: Ctrl+Shift+A to toggle assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        toggleAssistant()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleAssistant])

  // Show loading screen while migration is in progress
  const showLoading = migrationLoading && !migrationComplete

  const handleCloseView = useCallback(
    (viewId: string) => {
      const tab = tabs.find(t => t.viewId === viewId)
      if (tab) {
        closeTab(tab.id)
      }
    },
    [tabs, closeTab]
  )

  return (
    <div className="app">
      <TitleBar assistantOpen={assistantOpen} onToggleAssistant={toggleAssistant} />
      {showLoading ? (
        <div
          className="app-body"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '14px', marginBottom: '8px' }}>Loading...</div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>Initializing configuration</div>
          </div>
        </div>
      ) : (
        <div className="app-body">
          <ActivityBar selectedSection={selectedSection} onSectionSelect={handleSectionSelect} />
          <Allotment onChange={handlePaneChange} defaultSizes={paneSizes}>
            <Allotment.Pane minSize={200} maxSize={500}>
              <SidebarPanel
                section={selectedSection}
                onItemSelect={handleItemSelect}
                selectedItem={activeViewId}
                counts={prCounts}
                badgeProgress={badgeProgress}
                onCreateNew={handleCreateNew}
              />
            </Allotment.Pane>
            <Allotment.Pane minSize={400}>
              <div className="main-content-wrapper">
                <TabBar
                  tabs={tabs}
                  activeTabId={activeTabId}
                  onTabSelect={setActiveTabId}
                  onTabClose={closeTab}
                />
                <div className="main-content">
                  <AppErrorBoundary resetKey={activeViewId}>
                    <AppContentRouter
                      activeViewId={activeViewId}
                      prCounts={prCounts}
                      onNavigate={handleItemSelect}
                      onSectionChange={handleSectionSelect}
                      onOpenTab={openTab}
                      onCloseView={handleCloseView}
                      onPRCountChange={handlePRCountChange}
                    />
                  </AppErrorBoundary>
                </div>
              </div>
            </Allotment.Pane>
            {assistantOpen && (
              <Allotment.Pane
                minSize={280}
                maxSize={600}
                preferredSize={paneSizes[2] || DEFAULT_ASSISTANT_PANE_SIZE}
              >
                <AssistantPanel context={assistantContext} />
              </Allotment.Pane>
            )}
          </Allotment>
        </div>
      )}
      <StatusBar
        prCount={Object.values(prCounts).reduce((a, b) => a + b, 0)}
        scheduleCount={schedules?.length ?? 0}
        jobCount={jobs?.length ?? 0}
        activeGitHubAccount={activeGitHubAccount}
        backgroundStatus={backgroundStatus}
        onNavigate={openTab}
        assistantActive={assistantOpen}
      />
      {/* App-level Job Editor modal (triggered from sidebar "New Job") */}
      {jobEditorOpen && <JobEditor onClose={() => setJobEditorOpen(false)} />}
      {/* App-level Schedule Editor modal (triggered from sidebar "New Schedule") */}
      {scheduleEditorOpen && <ScheduleEditor onClose={() => setScheduleEditorOpen(false)} />}
    </div>
  )
}

export default App
