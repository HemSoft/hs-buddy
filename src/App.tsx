import { useState, useCallback, useRef, useEffect } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { TitleBar } from './components/TitleBar'
import { ActivityBar } from './components/ActivityBar'
import { SidebarPanel } from './components/SidebarPanel'
import { TabBar, Tab } from './components/TabBar'
import { PullRequestList } from './components/PullRequestList'
import { ScheduleList, JobList, RunList } from './components/automation'
import {
  SettingsAccounts,
  SettingsAppearance,
  SettingsPullRequests,
  SettingsAdvanced,
} from './components/settings'
// ReposOfInterest replaced by Organizations tree in GitHub sidebar
import { StatusBar } from './components/StatusBar'
import { useSchedules, useJobs } from './hooks/useConvex'
import { useMigrateToConvex } from './hooks/useMigration'
import { usePrefetch } from './hooks/usePrefetch'
import { usePRSettings } from './hooks/useConfig'
import { GitHubClient } from './api/github'
import { dataCache } from './services/dataCache'
import type { PullRequest } from './types/pullRequest'
import './App.css'

// View ID to label mapping
const viewLabels: Record<string, string> = {
  'pr-my-prs': 'My PRs',
  'pr-needs-review': 'Needs Review',
  'pr-recently-merged': 'Recently Merged',
  'skills-browser': 'Browse Skills',
  'skills-recent': 'Recently Used',
  'skills-favorites': 'Favorites',
  'tasks-today': 'Today',
  'tasks-upcoming': 'Upcoming',
  'tasks-projects': 'Projects',
  'insights-productivity': 'Productivity',
  'insights-activity': 'Activity',
  'settings-accounts': 'Accounts',
  'settings-appearance': 'Appearance',
  'settings-pullrequests': 'Pull Requests',
  'settings-advanced': 'Advanced',
  'automation-jobs': 'Jobs',
  'automation-schedules': 'Schedules',
  'automation-runs': 'Runs',
}

function App() {
  const [selectedSection, setSelectedSection] = useState<string>('github')
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // PR counts for sidebar badges — seed from cached data so badges show immediately on startup
  const [prCounts, setPrCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    const modes = [
      { key: 'my-prs', id: 'pr-my-prs' },
      { key: 'needs-review', id: 'pr-needs-review' },
      { key: 'recently-merged', id: 'pr-recently-merged' },
    ]
    for (const { key, id } of modes) {
      const cached = dataCache.get<PullRequest[]>(key)
      if (cached?.data) {
        initial[id] = cached.data.length
      }
    }
    return initial
  })

  // Subscribe to dataCache updates so sidebar badges update when prefetch completes
  // (even if the PullRequestList tab isn't open)
  useEffect(() => {
    const modeToId: Record<string, string> = {
      'my-prs': 'pr-my-prs',
      'needs-review': 'pr-needs-review',
      'recently-merged': 'pr-recently-merged',
    }
    const unsubscribe = dataCache.subscribe(key => {
      const viewId = modeToId[key]
      if (viewId) {
        const entry = dataCache.get<PullRequest[]>(key)
        if (entry?.data) {
          setPrCounts(prev => ({ ...prev, [viewId]: entry.data.length }))
        }
      }
    })
    return unsubscribe
  }, [])

  // Badge freshness progress — shows a timer ring around sidebar count badges
  const { refreshInterval } = usePRSettings()
  const [badgeProgress, setBadgeProgress] = useState<
    Record<string, { progress: number; color: string; tooltip: string }>
  >({})

  useEffect(() => {
    const PR_MODES = [
      { key: 'my-prs', id: 'pr-my-prs' },
      { key: 'needs-review', id: 'pr-needs-review' },
      { key: 'recently-merged', id: 'pr-recently-merged' },
    ]

    const getProgressColor = (pct: number) => {
      if (pct <= 25) return '#4ec9b0'
      if (pct <= 50) return '#dcd34a'
      if (pct <= 75) return '#e89b3c'
      return '#e85d5d'
    }

    const computeProgress = () => {
      const intervalMs = refreshInterval * 60 * 1000
      const now = Date.now()
      const next: Record<string, { progress: number; color: string; tooltip: string }> = {}

      for (const { key, id } of PR_MODES) {
        const cached = dataCache.get(key)
        if (cached) {
          const elapsed = now - cached.fetchedAt
          const remaining = Math.max(0, intervalMs - elapsed)
          const progress = Math.min(100, Math.max(0, (elapsed / intervalMs) * 100))
          const elapsedMin = Math.floor(elapsed / 60000)
          const remainingMin = Math.ceil(remaining / 60000)
          const tooltip =
            elapsedMin < 1
              ? `Updated just now \u00B7 Next in ${remainingMin}m`
              : `Updated ${elapsedMin}m ago \u00B7 Next in ${remainingMin}m`
          next[id] = { progress, color: getProgressColor(progress), tooltip }
        }
      }

      setBadgeProgress(next)
    }

    computeProgress()
    const timer = setInterval(computeProgress, 5000)
    return () => clearInterval(timer)
  }, [refreshInterval])

  // Create triggers for automation items (from sidebar context menu)
  const [scheduleCreateTrigger, setScheduleCreateTrigger] = useState(0)
  const [jobCreateTrigger, setJobCreateTrigger] = useState(0)

  // Pane sizes (persisted to electron-store via IPC)
  const [paneSizes, setPaneSizes] = useState<number[]>([300, 900])
  const paneSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Get schedule and job counts from Convex for status bar
  const schedules = useSchedules()
  const jobs = useJobs()

  // One-time migration from electron-store to Convex
  const { isComplete: migrationComplete, isLoading: migrationLoading } = useMigrateToConvex()

  // Prefetch PR data in background on app startup
  usePrefetch()

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
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  // Load theme from config on mount
  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-theme')
      .then((theme: 'dark' | 'light') => {
        document.documentElement.setAttribute('data-theme', theme || 'dark')
      })
      .catch(() => {
        document.documentElement.setAttribute('data-theme', 'dark')
      })
  }, [])

  // Load accent color from config on mount
  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-accent-color')
      .then((color: string) => {
        if (color) {
          const root = document.documentElement
          root.style.setProperty('--accent-primary', color)
          // Lighten for hover state
          const num = parseInt(color.replace('#', ''), 16)
          const r = Math.min(255, (num >> 16) + 38)
          const g = Math.min(255, ((num >> 8) & 0x00ff) + 38)
          const b = Math.min(255, (num & 0x0000ff) + 38)
          const hoverColor = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
          root.style.setProperty('--accent-primary-hover', hoverColor)
          root.style.setProperty('--border-focus', color)
        }
      })
      .catch(() => {})
  }, [])

  // Load background colors from config on mount
  useEffect(() => {
    Promise.all([
      window.ipcRenderer.invoke('config:get-bg-primary'),
      window.ipcRenderer.invoke('config:get-bg-secondary'),
      window.ipcRenderer.invoke('config:get-font-color'),
    ])
      .then(([bgPrimary, bgSecondary, fontColor]) => {
        const root = document.documentElement
        if (bgPrimary) {
          root.style.setProperty('--bg-primary', bgPrimary)
          root.style.setProperty('--panel-bg', bgPrimary)
          root.style.setProperty('--input-bg', bgPrimary)
        }
        if (bgSecondary) {
          root.style.setProperty('--bg-secondary', bgSecondary)
          root.style.setProperty('--sidebar-bg', bgSecondary)
        }
        if (fontColor) {
          root.style.setProperty('--text-primary', fontColor)
          // Derive heading color as a brighter version of font color
          const num = parseInt(fontColor.replace('#', ''), 16)
          const r = Math.min(255, (num >> 16) + Math.round((255 * 20) / 100))
          const g = Math.min(255, ((num >> 8) & 0x00ff) + Math.round((255 * 20) / 100))
          const b = Math.min(255, (num & 0x0000ff) + Math.round((255 * 20) / 100))
          root.style.setProperty(
            '--text-heading',
            `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
          )
        }
      })
      .catch(() => {})
  }, [])

  // Load font settings from config on mount
  useEffect(() => {
    Promise.all([
      window.ipcRenderer.invoke('config:get-font-family'),
      window.ipcRenderer.invoke('config:get-mono-font-family'),
      window.ipcRenderer.invoke('config:get-zoom-level'),
    ])
      .then(([fontFamily, monoFontFamily, zoomLevel]) => {
        if (fontFamily) {
          document.documentElement.style.setProperty(
            '--font-family-ui',
            `'${fontFamily}', system-ui, sans-serif`
          )
        }
        if (monoFontFamily) {
          document.documentElement.style.setProperty(
            '--font-family-mono',
            `'${monoFontFamily}', Consolas, monospace`
          )
        }
        if (zoomLevel && zoomLevel !== 100) {
          document.documentElement.style.fontSize = `${zoomLevel}%`
        }
      })
      .catch(() => {
        // Use defaults on error
      })
  }, [])

  // Load pane sizes from electron-store on mount
  useEffect(() => {
    window.ipcRenderer
      .invoke('config:get-pane-sizes')
      .then((sizes: number[]) => {
        if (
          Array.isArray(sizes) &&
          sizes.length === 2 &&
          sizes.every(n => typeof n === 'number' && n > 0)
        ) {
          setPaneSizes(sizes)
        }
      })
      .catch(() => {
        // Use default sizes on error
      })
  }, [])

  // Save pane sizes when changed (debounced)
  const handlePaneChange = useCallback((sizes: number[]) => {
    // Only save if we have valid sizes
    if (sizes.length === 2 && sizes.every(s => s > 0)) {
      setPaneSizes(sizes)
      // Debounce saving to electron-store
      if (paneSaveTimeoutRef.current) {
        clearTimeout(paneSaveTimeoutRef.current)
      }
      paneSaveTimeoutRef.current = setTimeout(() => {
        window.ipcRenderer.invoke('config:set-pane-sizes', sizes)
      }, 300)
    }
  }, [])

  // Open a new tab or activate existing one
  const openTab = useCallback(
    (viewId: string) => {
      // Check if tab already exists
      const existingTab = tabs.find(t => t.viewId === viewId)
      if (existingTab) {
        // Activate existing tab
        setActiveTabId(existingTab.id)
        return
      }

      // Create new tab
      const newTab: Tab = {
        id: `tab-${Date.now()}`,
        label: viewLabels[viewId] || viewId,
        viewId,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(newTab.id)
    },
    [tabs]
  )

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

  // Callbacks for PR count updates (wrapped in useCallback to avoid re-renders)
  const handleMyPrsCountChange = useCallback((count: number) => {
    setPrCounts(prev => ({ ...prev, 'pr-my-prs': count }))
  }, [])
  const handleNeedsReviewCountChange = useCallback((count: number) => {
    setPrCounts(prev => ({ ...prev, 'pr-needs-review': count }))
  }, [])
  const handleRecentlyMergedCountChange = useCallback((count: number) => {
    setPrCounts(prev => ({ ...prev, 'pr-recently-merged': count }))
  }, [])

  // Handle creating new items from sidebar context menu
  const handleCreateNew = useCallback(
    (type: 'schedule' | 'job') => {
      // Open the appropriate tab first
      const viewId = type === 'schedule' ? 'automation-schedules' : 'automation-jobs'
      openTab(viewId)
      // Trigger the create dialog
      if (type === 'schedule') {
        setScheduleCreateTrigger(prev => prev + 1)
      } else {
        setJobCreateTrigger(prev => prev + 1)
      }
    },
    [openTab]
  )

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

  // Show loading screen while migration is in progress
  const showLoading = migrationLoading && !migrationComplete

  const renderContent = () => {
    if (!activeViewId) {
      return (
        <div className="content-placeholder">
          <div className="content-header">
            <h2>Welcome to Buddy</h2>
          </div>
          <div className="content-body">
            <p>Your universal productivity companion</p>
            <p className="subtitle">Select an item from the sidebar to get started</p>
          </div>
        </div>
      )
    }

    switch (activeViewId) {
      case 'pr-my-prs':
        return <PullRequestList mode="my-prs" onCountChange={handleMyPrsCountChange} />
      case 'pr-needs-review':
        return <PullRequestList mode="needs-review" onCountChange={handleNeedsReviewCountChange} />
      case 'pr-recently-merged':
        return (
          <PullRequestList mode="recently-merged" onCountChange={handleRecentlyMergedCountChange} />
        )
      case 'settings-accounts':
        return <SettingsAccounts />
      case 'settings-appearance':
        return <SettingsAppearance />
      case 'settings-pullrequests':
        return <SettingsPullRequests />
      case 'settings-advanced':
        return <SettingsAdvanced />
      case 'automation-schedules':
        return <ScheduleList createTrigger={scheduleCreateTrigger} />
      case 'automation-jobs':
        return <JobList createTrigger={jobCreateTrigger} />
      case 'automation-runs':
        return <RunList />
      default:
        return (
          <div className="content-placeholder">
            <div className="content-header">
              <h2>{viewLabels[activeViewId] || 'Content'}</h2>
            </div>
            <div className="content-body">
              <p>This feature is coming soon!</p>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="app">
      <TitleBar />
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
                <div className="main-content">{renderContent()}</div>
              </div>
            </Allotment.Pane>
          </Allotment>
        </div>
      )}
      <StatusBar
        prCount={Object.values(prCounts).reduce((a, b) => a + b, 0)}
        scheduleCount={schedules?.length ?? 0}
        jobCount={jobs?.length ?? 0}
        activeGitHubAccount={activeGitHubAccount}
      />
    </div>
  )
}

export default App
