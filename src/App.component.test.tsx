import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/* ── hoisted mocks ── */
vi.mock('./components/TitleBar', () => ({
  TitleBar: () => <div data-testid="title-bar" />,
}))

vi.mock('./components/ActivityBar', () => ({
  ActivityBar: () => <div data-testid="activity-bar" />,
}))

vi.mock('./components/SidebarPanel', () => ({
  SidebarPanel: () => <div data-testid="sidebar-panel" />,
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
  AppContentRouter: () => <div data-testid="content-router" />,
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
  usePRSidebarBadges: () => ({
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
  useAppTabs: () => ({
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
