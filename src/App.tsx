import { useState, useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { TitleBar } from './components/TitleBar'
import { ActivityBar } from './components/ActivityBar'
import { SidebarPanel } from './components/SidebarPanel'
import { TabBar } from './components/TabBar'
import { StatusBar } from './components/StatusBar'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AppContentRouter } from './components/AppContentRouter'
import { TerminalPanel } from './components/terminal/TerminalPanel'
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
import { useTerminalPanel } from './hooks/useTerminalPanel'
import { computeAppMetrics, isAppLoading } from './appUtils'
import { getRepoContextFromViewId, type RepoContext } from './utils/repoContext'
import './App.css'

function useAppCallbacks(
  openTab: (viewId: string) => void,
  setSelectedSection: (section: string) => void,
  toggleTerminal: (activeViewId?: string | null) => void,
  activeViewId: string | null,
  addTerminalTab: (repoContext: RepoContext | null) => Promise<unknown>,
  setPRCount: (viewId: string, count: number) => void
) {
  const handlePRCountChange = useCallback(
    (viewId: string, count: number) => {
      setPRCount(viewId, count)
    },
    [setPRCount]
  )

  const handleSectionSelect = useCallback(
    (sectionId: string) => {
      setSelectedSection(sectionId)
      if (sectionId === 'bookmarks') {
        openTab('bookmarks-all')
      }
    },
    [openTab, setSelectedSection]
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

  const handleToggleTerminal = useCallback(() => {
    toggleTerminal(activeViewId)
  }, [toggleTerminal, activeViewId])

  const handleAddTerminalTab = useCallback(() => {
    const repoContext = activeViewId ? getRepoContextFromViewId(activeViewId) : null
    void addTerminalTab(repoContext)
  }, [addTerminalTab, activeViewId])

  const handleOpenFolderView = useCallback(
    (cwd: string) => {
      openTab(`folder-view:${encodeURIComponent(cwd)}`)
    },
    [openTab]
  )

  return {
    handlePRCountChange,
    handleSectionSelect,
    handleItemSelect,
    handleHomeClick,
    handleToggleTerminal,
    handleAddTerminalTab,
    handleOpenFolderView,
  }
}

function AppLoadingState() {
  return (
    <div
      className="app-body"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: '14px', marginBottom: '8px' }}>Loading...</div>
        <div style={{ fontSize: '12px', opacity: 0.7 }}>Initializing configuration</div>
      </div>
    </div>
  )
}

function AppMainContent({
  tabs,
  activeTabId,
  setActiveTabId,
  closeTab,
  closeOtherTabs,
  closeTabsToRight,
  closeAllTabs,
  onPanelResize,
  activeViewId,
  prCounts,
  handleItemSelect,
  handleSectionSelect,
  openTab,
  closeView,
  handlePRCountChange,
  terminalOpen,
  panelHeight,
  terminalTabs,
  activeTerminalTabId,
  selectTerminalTab,
  closeTerminalTab,
  handleAddTerminalTab,
  renameTerminalTab,
  setTerminalTabColor,
  reorderTerminalTabs,
  updateTabCwd,
  handleOpenFolderView,
}: Pick<
  ReturnType<typeof useAppTabs>,
  | 'tabs'
  | 'activeTabId'
  | 'setActiveTabId'
  | 'closeTab'
  | 'closeOtherTabs'
  | 'closeTabsToRight'
  | 'closeAllTabs'
  | 'openTab'
  | 'closeView'
  | 'activeViewId'
> & {
  onPanelResize: (sizes: number[]) => void
  prCounts: Record<string, number>
  handleItemSelect: (itemId: string) => void
  handleSectionSelect: (sectionId: string) => void
  handlePRCountChange: (viewId: string, count: number) => void
  terminalOpen: boolean
  panelHeight: number
  terminalTabs: ReturnType<typeof useTerminalPanel>['terminalTabs']
  activeTerminalTabId: string | null
  selectTerminalTab: (id: string) => void
  closeTerminalTab: (id: string) => void
  handleAddTerminalTab: () => void
  renameTerminalTab: ReturnType<typeof useTerminalPanel>['renameTerminalTab']
  setTerminalTabColor: ReturnType<typeof useTerminalPanel>['setTerminalTabColor']
  reorderTerminalTabs: ReturnType<typeof useTerminalPanel>['reorderTerminalTabs']
  updateTabCwd: ReturnType<typeof useTerminalPanel>['updateTabCwd']
  handleOpenFolderView: (cwd: string) => void
}) {
  return (
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
      <Allotment vertical onChange={onPanelResize}>
        <Allotment.Pane minSize={200}>
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
        </Allotment.Pane>
        <Allotment.Pane minSize={150} preferredSize={panelHeight} visible={terminalOpen}>
          <TerminalPanel
            tabs={terminalTabs}
            activeTabId={activeTerminalTabId}
            onTabSelect={selectTerminalTab}
            onTabClose={closeTerminalTab}
            onAddTab={handleAddTerminalTab}
            onRenameTab={renameTerminalTab}
            onSetTabColor={setTerminalTabColor}
            onReorderTabs={reorderTerminalTabs}
            onTabCwdChange={updateTabCwd}
            onOpenFolderView={handleOpenFolderView}
          />
        </Allotment.Pane>
      </Allotment>
    </div>
  )
}

function App() {
  const [selectedSection, setSelectedSection] = useState<string>('github')
  const { prCounts, badgeProgress, setPRCount } = usePRSidebarBadges()
  const schedules = useSchedules()
  const jobs = useJobs()
  const { isComplete: migrationComplete, isLoading: migrationLoading } = useMigrateToConvex()
  usePrefetch()
  useAppAppearance()
  const backgroundStatus = useBackgroundStatus()
  const { trackViewOpen } = useAppSessionStats()

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
  })
  const {
    assistantOpen,
    handlePaneChange,
    loaded: layoutLoaded,
    paneSizes,
    toggleAssistant,
  } = useAppLayout()
  const {
    terminalOpen,
    terminalTabs,
    activeTerminalTabId,
    toggleTerminal,
    addTerminalTab,
    closeTerminalTab,
    selectTerminalTab,
    renameTerminalTab,
    setTerminalTabColor,
    reorderTerminalTabs,
    updateTabCwd,
    panelHeight,
    onPanelResize,
    loaded: terminalLoaded,
  } = useTerminalPanel(activeViewId)
  const activeGitHubAccount = useActiveGitHubAccount()

  const {
    handlePRCountChange,
    handleSectionSelect,
    handleItemSelect,
    handleHomeClick,
    handleToggleTerminal,
    handleAddTerminalTab,
    handleOpenFolderView,
  } = useAppCallbacks(
    openTab,
    setSelectedSection,
    toggleTerminal,
    activeViewId,
    addTerminalTab,
    setPRCount
  )

  const assistantContext = useAssistantContext(activeViewId)
  const showLoading = isAppLoading(
    layoutLoaded,
    terminalLoaded,
    migrationLoading,
    migrationComplete
  )
  const { scheduleCount, jobCount, totalPRCount, defaultSizes, assistantPaneSize } =
    computeAppMetrics(schedules, jobs, prCounts, assistantOpen, paneSizes)

  return (
    <div className="app">
      <TitleBar
        assistantOpen={assistantOpen}
        onToggleAssistant={toggleAssistant}
        terminalOpen={terminalOpen}
        onToggleTerminal={handleToggleTerminal}
      />
      {showLoading ? (
        <AppLoadingState />
      ) : (
        <div className="app-body">
          <ActivityBar
            selectedSection={selectedSection}
            onSectionSelect={handleSectionSelect}
            isDashboardActive={activeViewId === DASHBOARD_VIEW_ID}
            onHomeClick={handleHomeClick}
          />
          <Allotment onChange={handlePaneChange} defaultSizes={defaultSizes}>
            <Allotment.Pane minSize={200}>
              <SidebarPanel
                section={selectedSection}
                onItemSelect={handleItemSelect}
                selectedItem={activeViewId}
                counts={prCounts}
                badgeProgress={badgeProgress}
              />
            </Allotment.Pane>
            <Allotment.Pane minSize={400}>
              <AppMainContent
                tabs={tabs}
                activeTabId={activeTabId}
                setActiveTabId={setActiveTabId}
                closeTab={closeTab}
                closeOtherTabs={closeOtherTabs}
                closeTabsToRight={closeTabsToRight}
                closeAllTabs={closeAllTabs}
                onPanelResize={onPanelResize}
                activeViewId={activeViewId}
                prCounts={prCounts}
                handleItemSelect={handleItemSelect}
                handleSectionSelect={handleSectionSelect}
                openTab={openTab}
                closeView={closeView}
                handlePRCountChange={handlePRCountChange}
                terminalOpen={terminalOpen}
                panelHeight={panelHeight}
                terminalTabs={terminalTabs}
                activeTerminalTabId={activeTerminalTabId}
                selectTerminalTab={selectTerminalTab}
                closeTerminalTab={closeTerminalTab}
                handleAddTerminalTab={handleAddTerminalTab}
                renameTerminalTab={renameTerminalTab}
                setTerminalTabColor={setTerminalTabColor}
                reorderTerminalTabs={reorderTerminalTabs}
                updateTabCwd={updateTabCwd}
                handleOpenFolderView={handleOpenFolderView}
              />
            </Allotment.Pane>
            {assistantOpen && (
              <Allotment.Pane minSize={280} maxSize={600} preferredSize={assistantPaneSize}>
                <AssistantPanel context={assistantContext} />
              </Allotment.Pane>
            )}
          </Allotment>
        </div>
      )}
      <StatusBar
        prCount={totalPRCount}
        scheduleCount={scheduleCount}
        jobCount={jobCount}
        activeGitHubAccount={activeGitHubAccount}
        backgroundStatus={backgroundStatus}
        onNavigate={openTab}
        assistantActive={assistantOpen}
      />
    </div>
  )
}

export default App
