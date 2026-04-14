import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarPanel } from './SidebarPanel'

vi.mock('./sidebar/BookmarksSidebar', () => ({
  BookmarksSidebar: () => <div data-testid="bookmarks-sidebar" />,
}))

vi.mock('./sidebar/CopilotSidebar', () => ({
  CopilotSidebar: () => <div data-testid="copilot-sidebar" />,
}))

vi.mock('./sidebar/GitHubSidebar', () => ({
  GitHubSidebar: () => <div data-testid="github-sidebar" />,
}))

vi.mock('./crew/CrewSidebar', () => ({
  CrewSidebar: () => <div data-testid="crew-sidebar" />,
}))

vi.mock('../hooks/useConvex', () => ({
  useJobs: () => [],
  useSchedules: () => [],
}))

vi.mock('./sidebar-panel/AutomationSidebarSection', () => ({
  AutomationSidebarSection: () => <div data-testid="automation-section" />,
}))

describe('SidebarPanel', () => {
  const onItemSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders GitHub sidebar for github section', () => {
    render(<SidebarPanel section="github" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByTestId('github-sidebar')).toBeTruthy()
  })

  it('renders Copilot sidebar for copilot section', () => {
    render(<SidebarPanel section="copilot" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByTestId('copilot-sidebar')).toBeTruthy()
  })

  it('renders Crew sidebar for crew section', () => {
    render(<SidebarPanel section="crew" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByTestId('crew-sidebar')).toBeTruthy()
  })

  it('renders Bookmarks sidebar for bookmarks section', () => {
    render(<SidebarPanel section="bookmarks" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByTestId('bookmarks-sidebar')).toBeTruthy()
  })

  it('renders settings section with items', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Accounts')).toBeTruthy()
    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('Pull Requests')).toBeTruthy()
  })

  it('calls onItemSelect when item clicked', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    fireEvent.click(screen.getByText('Accounts'))
    expect(onItemSelect).toHaveBeenCalledWith('settings-accounts')
  })

  it('returns null for unknown section', () => {
    const { container } = render(
      <SidebarPanel section="nonexistent" onItemSelect={onItemSelect} selectedItem={null} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders tasks section', () => {
    render(<SidebarPanel section="tasks" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Upcoming')).toBeTruthy()
  })

  it('renders tempo section and auto-selects single item', () => {
    render(<SidebarPanel section="tempo" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Timesheet')).toBeTruthy()
    expect(onItemSelect).toHaveBeenCalledWith('tempo-timesheet')
  })

  it('collapses section when header is clicked', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    // Items should be visible initially
    expect(screen.getByText('Accounts')).toBeTruthy()
    // Click the section header to collapse
    fireEvent.click(screen.getByText('Settings'))
    // Items should now be hidden
    expect(screen.queryByText('Accounts')).toBeNull()
  })

  it('expands collapsed section when header is clicked again', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    // Collapse
    fireEvent.click(screen.getByText('Settings'))
    expect(screen.queryByText('Accounts')).toBeNull()
    // Expand
    fireEvent.click(screen.getByText('Settings'))
    expect(screen.getByText('Accounts')).toBeTruthy()
  })

  it('toggles section via keyboard (Enter)', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const header = screen.getByText('Settings').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: 'Enter' })
    expect(screen.queryByText('Accounts')).toBeNull()
  })

  it('toggles section via keyboard (Space)', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const header = screen.getByText('Settings').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: ' ' })
    expect(screen.queryByText('Accounts')).toBeNull()
  })

  it('selects item via keyboard (Enter)', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const item = screen.getByText('Accounts').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('settings-accounts')
  })

  it('highlights selected item', () => {
    render(
      <SidebarPanel
        section="settings"
        onItemSelect={onItemSelect}
        selectedItem="settings-accounts"
      />
    )
    const item = screen.getByText('Accounts').closest('.sidebar-item')
    expect(item?.className).toContain('selected')
  })

  it('shows count badge when counts are provided', () => {
    render(
      <SidebarPanel
        section="settings"
        onItemSelect={onItemSelect}
        selectedItem={null}
        counts={{ 'settings-accounts': 3 }}
      />
    )
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shows progress ring badge when badgeProgress is provided', () => {
    const { container } = render(
      <SidebarPanel
        section="settings"
        onItemSelect={onItemSelect}
        selectedItem={null}
        counts={{ 'settings-accounts': 5 }}
        badgeProgress={{
          'settings-accounts': { progress: 75, color: '#4ec9b0', tooltip: '75% complete' },
        }}
      />
    )
    const ring = container.querySelector('.sidebar-item-count-ring')
    expect(ring).toBeTruthy()
    expect(ring?.getAttribute('title')).toBe('75% complete')
  })

  it('renders automation section with AutomationSidebarSection', () => {
    render(<SidebarPanel section="automation" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByTestId('automation-section')).toBeTruthy()
  })

  it('shows section title in uppercase', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('SETTINGS')).toBeTruthy()
  })
})
