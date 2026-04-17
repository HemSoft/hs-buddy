import { useState, useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { TitleBar } from './components/TitleBar'
import { ActivityBar } from './components/ActivityBar'
import { SidebarPanel } from './components/SidebarPanel'
import { TabBar } from './components/TabBar'
import { ScheduleEditor, JobEditor } from './components/automation'
import { StatusBar } from './components/StatusBar'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AppContentRouter } from './components/AppContentRouter'
import { killTerminalSession } from './components/terminal/terminalSessions'
import { AssistantPanel } from './components/AssistantPanel'
import { useSchedules, useJobs } from './hooks/useConvex'
import { useMigrateToConvex } from './hooks/useMigration'
import { usePrefetch } from './hooks/usePrefetch'
import { useBackgroundStatus } from './hooks/useBackgroundStatus'
import { useAppAppearance } from './hooks/useAppAppearance'
import { usePRSidebarBadges } from './hooks/usePRSidebarBadges'
import { useAssistantContext } from './hooks/useAssistantContext'
import { useActiveGitHubAccount } from './hooks/useActiveGitHubAccount'
import { useAppLayout } from './hooks/useAppLayout'
import { useAppSessionStats } from './hooks/useAppSessionStats'
import { useAppTabs, DASHBOARD_VIEW_ID } from './hooks/useAppTabs'
import { DEFAULT_ASSISTANT_PANE_SIZE } from './appUtils'
import './App.css'

function App() {
  const [selectedSection, setSelectedSection] = useState<string>('github')
  const { prCounts, badgeProgress, setPRCount } = usePRSidebarBadges()
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false)
  const [jobEditorOpen, setJobEditorOpen] = useState(false)
  const schedules = useSchedules()
  const jobs = useJobs()
  const { isComplete: migrationComplete, isLoading: migrationLoading } = useMigrateToConvex()
  usePrefetch()
  useAppAppearance()
  const backgroundStatus = useBackgroundStatus()
  const { trackViewOpen } = useAppSessionStats()
  const handleViewClose = useCallback((viewId: string) => {
    if (viewId.startsWith('terminal:')) {
      killTerminalSession(viewId)
    }
  }, [])

  const {
    activeTabId,
    activeViewId,
    closeAllTabs,
    closeOtherTabs,
    closeTab,
    closeTabsToRight,
    closeView,
    openTab,
    setActiveTabId,
    tabs,
  } = useAppTabs({
    onViewOpen: trackViewOpen,
    onViewClose: handleViewClose,
  })
  const {
    assistantOpen,
    handlePaneChange,
    loaded: layoutLoaded,
    paneSizes,
    toggleAssistant,
  } = useAppLayout()
  const activeGitHubAccount = useActiveGitHubAccount()

  const handlePRCountChange = useCallback(
    (viewId: string, count: number) => {
      setPRCount(viewId, count)
    },
    [setPRCount]
  )

  const handleCreateNew = useCallback((type: 'schedule' | 'job') => {
    if (type === 'schedule') {
      setScheduleEditorOpen(true)
    } else {
      setJobEditorOpen(true)
    }
  }, [])

  const handleSectionSelect = useCallback(
    (sectionId: string) => {
      setSelectedSection(sectionId)
      if (sectionId === 'bookmarks') {
        openTab('bookmarks-all')
      }
    },
    [openTab]
  )

  const handleItemSelect = useCallback(
    (viewId: string) => {
      openTab(viewId)
    },
    [openTab]
  )

  const handleHomeClick = useCallback(() => {
    openTab(DASHBOARD_VIEW_ID)
  }, [openTab])

  const assistantContext = useAssistantContext(activeViewId)
  const showLoading = !layoutLoaded || (migrationLoading && !migrationComplete)

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
          <ActivityBar
            selectedSection={selectedSection}
            onSectionSelect={handleSectionSelect}
            isDashboardActive={activeViewId === DASHBOARD_VIEW_ID}
            onHomeClick={handleHomeClick}
          />
          <Allotment
            onChange={handlePaneChange}
            defaultSizes={assistantOpen ? paneSizes : paneSizes.slice(0, 2)}
          >
            <Allotment.Pane minSize={200}>
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
                  onCloseOtherTabs={closeOtherTabs}
                  onCloseTabsToRight={closeTabsToRight}
                  onCloseAllTabs={closeAllTabs}
                />
                <div className="main-content">
                  <AppErrorBoundary resetKey={activeViewId}>
                    <AppContentRouter
                      activeViewId={activeViewId}
                      prCounts={prCounts}
                      onNavigate={handleItemSelect}
                      onSectionChange={handleSectionSelect}
                      onOpenTab={openTab}
                      onCloseView={closeView}
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
