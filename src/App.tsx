import { useState, useCallback, useRef } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { TitleBar } from './components/TitleBar'
import { ActivityBar } from './components/ActivityBar'
import { SidebarPanel } from './components/SidebarPanel'
import { TabBar, Tab } from './components/TabBar'
import { PullRequestList } from './components/PullRequestList'
import { Settings } from './components/Settings'
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
  'settings': 'Settings',
}

function App() {
  const [selectedSection, setSelectedSection] = useState<string>('pull-requests')
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // Pane sizes (persisted to localStorage)
  const [paneSizes, setPaneSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('buddy-pane-sizes')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Validate it's an array with 2 numbers
        if (Array.isArray(parsed) && parsed.length === 2 && parsed.every(n => typeof n === 'number')) {
          return parsed
        }
      } catch {
        // Invalid JSON, use default
      }
    }
    return [300, 900] // Explicit sizes for both panes
  })
  const paneSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Save pane sizes when changed (debounced)
  const handlePaneChange = useCallback((sizes: number[]) => {
    // Only save if we have valid sizes
    if (sizes.length === 2 && sizes.every(s => s > 0)) {
      setPaneSizes(sizes)
      // Debounce localStorage writes
      if (paneSaveTimeoutRef.current) {
        clearTimeout(paneSaveTimeoutRef.current)
      }
      paneSaveTimeoutRef.current = setTimeout(() => {
        localStorage.setItem('buddy-pane-sizes', JSON.stringify(sizes))
      }, 300)
    }
  }, [])

  // Open a new tab or activate existing one
  const openTab = useCallback((viewId: string) => {
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
  }, [tabs])

  // Close a tab
  const closeTab = useCallback((tabId: string) => {
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
  }, [activeTabId])

  const handleSectionSelect = (sectionId: string) => {
    setSelectedSection(sectionId)
    
    // For settings, handle specially (no sidebar, direct content)
    if (sectionId === 'settings') {
      openTab('settings')
    }
    // Don't auto-open tabs for other sections - let user click in sidebar
  }

  const handleItemSelect = (viewId: string) => {
    openTab(viewId)
  }

  // Get active tab's viewId
  const activeTab = tabs.find(t => t.id === activeTabId)
  const activeViewId = activeTab?.viewId || null

  const renderContent = () => {
    if (!activeViewId) {
      return (
        <div className="content-placeholder">
          <div className="content-header">
            <h2>Welcome to Buddy</h2>
          </div>
          <div className="content-body">
            <p>Your universal productivity companion</p>
            <p className="subtitle">
              Select an item from the sidebar to get started
            </p>
          </div>
        </div>
      )
    }

    switch (activeViewId) {
      case 'pr-my-prs':
        return <PullRequestList mode="my-prs" />
      case 'pr-needs-review':
        return <PullRequestList mode="needs-review" />
      case 'pr-recently-merged':
        return <PullRequestList mode="recently-merged" />
      case 'settings':
        return <Settings />
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
      <div className="app-body">
        <ActivityBar 
          selectedSection={selectedSection}
          onSectionSelect={handleSectionSelect}
        />
        {selectedSection !== 'settings' ? (
          <Allotment onChange={handlePaneChange} defaultSizes={paneSizes}>
            <Allotment.Pane minSize={200} maxSize={500}>
              <SidebarPanel 
                section={selectedSection}
                onItemSelect={handleItemSelect}
                selectedItem={activeViewId}
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
        ) : (
          <div className="main-content-wrapper">
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onTabSelect={setActiveTabId}
              onTabClose={closeTab}
            />
            <div className="main-content">{renderContent()}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
