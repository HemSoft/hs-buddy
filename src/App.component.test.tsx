import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

/* ── hoisted mocks ── */
vi.mock('./components/TitleBar', () => ({
  TitleBar: () => <div data-testid="title-bar" />,
}))

vi.mock('./components/ActivityBar', () => ({
  ActivityBar: vi.fn(() => <div data-testid="activity-bar" />),
}))

vi.mock('./components/SidebarPanel', () => ({
  SidebarPanel: vi.fn(() => <div data-testid="sidebar-panel" />),
}))

vi.mock('./components/TabBar', () => ({
  TabBar: () => <div data-testid="tab-bar" />,
}))

vi.mock('./components/automation', () => ({
  ScheduleEditor: () => <div data-testid="schedule-editor" />,
  JobEditor: () => <div data-testid="job-editor" />,
}))

vi.mock('./components/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}))

vi.mock('./components/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('./components/AppContentRouter', () => ({
  AppContentRouter: vi.fn(() => <div data-testid="content-router" />),
}))

vi.mock('./components/AssistantPanel', () => ({
  AssistantPanel: () => <div data-testid="assistant-panel" />,
}))

vi.mock('allotment', () => {
  function MockAllotment({ children }: { children: React.ReactNode }) {
    return <div data-testid="allotment">{children}</div>
  }
  MockAllotment.Pane = function MockPane({ children }: { children: React.ReactNode }) {
    return <div data-testid="allotment-pane">{children}</div>
  }
  return { Allotment: MockAllotment }
})

vi.mock('./hooks/useConvex', () => ({
  useSchedules: () => [{ id: '1', name: 'sched' }],
  useJobs: () => [{ id: '1', name: 'job' }],
}))

vi.mock('./hooks/useMigration', () => ({
  useMigrateToConvex: vi.fn().mockReturnValue({ isComplete: true, isLoading: false }),
}))

vi.mock('./hooks/usePrefetch', () => ({
  usePrefetch: vi.fn(),
}))

vi.mock('./hooks/useBackgroundStatus', () => ({
  useBackgroundStatus: () => null,
}))

vi.mock('./hooks/useAppAppearance', () => ({
  useAppAppearance: vi.fn(),
}))

vi.mock('./hooks/usePRSidebarBadges', () => ({
  usePRSidebarBadges: vi.fn().mockReturnValue({
    prCounts: { 'pr-list': 5 },
    badgeProgress: null,
    setPRCount: vi.fn(),
  }),
}))

vi.mock('./hooks/useAssistantContext', () => ({
  useAssistantContext: () => null,
}))

vi.mock('./hooks/useActiveGitHubAccount', () => ({
  useActiveGitHubAccount: () => 'alice',
}))

vi.mock('./hooks/useAppLayout', () => ({
  useAppLayout: () => ({
    assistantOpen: false,
    handlePaneChange: vi.fn(),
    loaded: true,
    paneSizes: [200, 600],
    toggleAssistant: vi.fn(),
  }),
}))

vi.mock('./hooks/useAppSessionStats', () => ({
  useAppSessionStats: () => ({ trackViewOpen: vi.fn() }),
}))

vi.mock('./hooks/useAppTabs', () => ({
  DASHBOARD_VIEW_ID: 'dashboard',
  useAppTabs: vi.fn().mockReturnValue({
    activeTabId: 'welcome',
    activeViewId: 'welcome',
    closeAllTabs: vi.fn(),
    closeOtherTabs: vi.fn(),
    closeTab: vi.fn(),
    closeTabsToRight: vi.fn(),
    closeView: vi.fn(),
    openTab: vi.fn(),
    setActiveTabId: vi.fn(),
    tabs: [{ id: 'welcome', label: 'Welcome' }],
  }),
}))

import App from './App'
import { ActivityBar } from './components/ActivityBar'
import { SidebarPanel } from './components/SidebarPanel'
import { AppContentRouter } from './components/AppContentRouter'
import { useAppTabs } from './hooks/useAppTabs'
import { usePRSidebarBadges } from './hooks/usePRSidebarBadges'
import { useMigrateToConvex } from './hooks/useMigration'

const MockActivityBar = vi.mocked(ActivityBar)
const MockSidebarPanel = vi.mocked(SidebarPanel)
const MockAppContentRouter = vi.mocked(AppContentRouter)
const MockUseAppTabs = vi.mocked(useAppTabs)
const MockUsePRSidebarBadges = vi.mocked(usePRSidebarBadges)
const MockUseMigrateToConvex = vi.mocked(useMigrateToConvex)

describe('App component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the main app UI', () => {
    render(<App />)
    expect(screen.getByTestId('title-bar')).toBeInTheDocument()
    expect(screen.getByTestId('status-bar')).toBeInTheDocument()
  })

  it('renders sidebar, tabs, and content area', () => {
    render(<App />)
    expect(screen.getByTestId('sidebar-panel')).toBeInTheDocument()
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    expect(screen.getByTestId('content-router')).toBeInTheDocument()
  })

  it('renders activity bar', () => {
    render(<App />)
    expect(screen.getByTestId('activity-bar')).toBeInTheDocument()
  })
})

describe('App loading state', () => {
  it('shows loading screen when migration is in progress', async () => {
    // Override the migration mock for this test
    const { useMigrateToConvex } = await import('./hooks/useMigration')
    vi.mocked(useMigrateToConvex).mockReturnValue({ isComplete: false, isLoading: true })

    render(<App />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.getByText('Initializing configuration')).toBeInTheDocument()
  })
})

describe('App callbacks', () => {
  let mockOpenTab: ReturnType<typeof vi.fn>
  let mockSetPRCount: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOpenTab = vi.fn()
    mockSetPRCount = vi.fn()

    // Ensure migration is complete (may be overridden by earlier tests)
    MockUseMigrateToConvex.mockReturnValue({ isComplete: true, isLoading: false })

    MockUseAppTabs.mockReturnValue({
      activeTabId: 'welcome',
      activeViewId: 'welcome',
      closeAllTabs: vi.fn(),
      closeOtherTabs: vi.fn(),
      closeTab: vi.fn(),
      closeTabsToRight: vi.fn(),
      closeView: vi.fn(),
      openTab: mockOpenTab as (viewId: string) => Promise<void>,
      setActiveTabId: vi.fn(),
      tabs: [{ id: 'welcome', label: 'Welcome', viewId: 'welcome' }],
    })

    MockUsePRSidebarBadges.mockReturnValue({
      prCounts: { 'pr-list': 5 },
      badgeProgress: {},
      setPRCount: mockSetPRCount as (viewId: string, count: number) => void,
    })
  })

  function getLastCallProps(mockFn: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const calls = mockFn.mock.calls
    return calls[calls.length - 1][0] as Record<string, unknown>
  }

  it('handleHomeClick calls openTab with dashboard view ID', () => {
    render(<App />)
    const props = getLastCallProps(MockActivityBar)
    act(() => {
      ;(props.onHomeClick as () => void)()
    })
    expect(mockOpenTab).toHaveBeenCalledWith('dashboard')
  })

  it('handleSectionSelect opens bookmarks tab when bookmarks section selected', () => {
    render(<App />)
    const props = getLastCallProps(MockActivityBar)
    act(() => {
      ;(props.onSectionSelect as (id: string) => void)('bookmarks')
    })
    expect(mockOpenTab).toHaveBeenCalledWith('bookmarks-all')
  })

  it('handleItemSelect opens tab for selected view', () => {
    render(<App />)
    const props = getLastCallProps(MockSidebarPanel)
    act(() => {
      ;(props.onItemSelect as (id: string) => void)('pr-my-prs')
    })
    expect(mockOpenTab).toHaveBeenCalledWith('pr-my-prs')
  })

  it('handleCreateNew opens job editor for job type', () => {
    render(<App />)
    const props = getLastCallProps(MockSidebarPanel)
    act(() => {
      ;(props.onCreateNew as (type: string) => void)('job')
    })
    expect(screen.getByTestId('job-editor')).toBeInTheDocument()
  })

  it('handleCreateNew opens schedule editor for schedule type', () => {
    render(<App />)
    const props = getLastCallProps(MockSidebarPanel)
    act(() => {
      ;(props.onCreateNew as (type: string) => void)('schedule')
    })
    expect(screen.getByTestId('schedule-editor')).toBeInTheDocument()
  })

  it('handlePRCountChange calls setPRCount with viewId and count', () => {
    render(<App />)
    const props = getLastCallProps(MockAppContentRouter)
    act(() => {
      ;(props.onPRCountChange as (viewId: string, count: number) => void)('pr-my-prs', 10)
    })
    expect(mockSetPRCount).toHaveBeenCalledWith('pr-my-prs', 10)
  })
})
