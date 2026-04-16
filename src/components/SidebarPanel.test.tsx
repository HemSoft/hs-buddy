import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarPanel } from './SidebarPanel'

vi.mock('./sidebar/BookmarksSidebar', () => ({
  BookmarksSidebar: () => <div data-testid="bookmarks-sidebar" />,
}))

vi.mock('./sidebar/CopilotSidebar', () => ({
  CopilotSidebar: () => <div data-testid="copilot-sidebar" />,
}))

vi.mock('./sidebar/BookmarksSidebar', () => ({
  BookmarksSidebar: () => <div data-testid="bookmarks-sidebar" />,
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

  it('renders bookmarks section', () => {
    render(<SidebarPanel section="bookmarks" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByTestId('bookmarks-sidebar')).toBeTruthy()
    expect(screen.queryByTestId('github-sidebar')).toBeFalsy()
  })

  it('renders automation section', () => {
    render(<SidebarPanel section="automation" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByTestId('automation-section')).toBeTruthy()
  })

  it('renders insights section', () => {
    render(<SidebarPanel section="insights" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Productivity')).toBeTruthy()
    expect(screen.getByText('Activity')).toBeTruthy()
  })

  it('renders skills section', () => {
    render(<SidebarPanel section="skills" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Browse Skills')).toBeTruthy()
  })

  it('shows badge count when provided', () => {
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

  it('highlights selected item', () => {
    render(
      <SidebarPanel
        section="settings"
        onItemSelect={onItemSelect}
        selectedItem="settings-accounts"
      />
    )
    const item = screen.getByText('Accounts').closest('.sidebar-item, [class*=sidebar]')
    expect(item).toBeTruthy()
  })

  it('auto-selects when section has exactly one item', () => {
    render(<SidebarPanel section="tempo" onItemSelect={onItemSelect} selectedItem={null} />)
    // tempo has only 1 item "Timesheet" - should auto-select
    expect(onItemSelect).toHaveBeenCalledWith('tempo-timesheet')
  })

  it('collapses section when header clicked, then re-expands', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Accounts')).toBeTruthy()

    // Click header to collapse
    fireEvent.click(screen.getByText('Settings'))
    expect(screen.queryByText('Accounts')).toBeFalsy()

    // Click header again to expand
    fireEvent.click(screen.getByText('Settings'))
    expect(screen.getByText('Accounts')).toBeTruthy()
  })

  it('toggles section via Enter key on header', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Accounts')).toBeTruthy()

    const header = screen.getByText('Settings').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: 'Enter' })
    expect(screen.queryByText('Accounts')).toBeFalsy()

    fireEvent.keyDown(header, { key: 'Enter' })
    expect(screen.getByText('Accounts')).toBeTruthy()
  })

  it('toggles section via Space key on header', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Accounts')).toBeTruthy()

    const header = screen.getByText('Settings').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: ' ' })
    expect(screen.queryByText('Accounts')).toBeFalsy()
  })

  it('selects item via Enter key', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const item = screen.getByText('Accounts').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('settings-accounts')
  })

  it('selects item via Space key', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const item = screen.getByText('Appearance').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: ' ' })
    expect(onItemSelect).toHaveBeenCalledWith('settings-appearance')
  })

  it('renders badge with progress ring when badgeProgress provided', () => {
    render(
      <SidebarPanel
        section="settings"
        onItemSelect={onItemSelect}
        selectedItem={null}
        counts={{ 'settings-accounts': 5 }}
        badgeProgress={{
          'settings-accounts': { progress: 75, color: '#00ff00', tooltip: '75% done' },
        }}
      />
    )
    const ring = screen.getByTitle('75% done')
    expect(ring).toBeTruthy()
    expect(ring.className).toContain('sidebar-item-count-ring')
    expect(ring.style.getPropertyValue('--ring-progress')).toBe('75%')
    expect(ring.style.getPropertyValue('--ring-color')).toBe('#00ff00')
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('does not show context menu on right-click of non-automation item', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const item = screen.getByText('Accounts').closest('[role="button"]')!
    fireEvent.contextMenu(item)
    expect(screen.queryByText('New Schedule')).toBeFalsy()
    expect(screen.queryByText('New Job')).toBeFalsy()
  })

  it('expands new section when section prop changes', () => {
    const { rerender } = render(
      <SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />
    )
    expect(screen.getByText('Accounts')).toBeTruthy()

    rerender(<SidebarPanel section="tasks" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Upcoming')).toBeTruthy()
  })

  it('does not open context menu on right-click of non-automation items (Escape is a no-op)', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const item = screen.getByText('Accounts').closest('[role="button"]')!
    fireEvent.contextMenu(item)
    // Context menu should NOT appear for non-automation items
    expect(screen.queryByText('New Schedule')).toBeFalsy()
    expect(screen.queryByText('New Job')).toBeFalsy()
    // Escape keydown is a no-op when no context menu is open
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('New Schedule')).toBeFalsy()
  })

  it('does not render context menu overlay initially', () => {
    const onCreateNew = vi.fn()
    const { container } = render(
      <SidebarPanel
        section="settings"
        onItemSelect={onItemSelect}
        selectedItem={null}
        onCreateNew={onCreateNew}
      />
    )
    expect(container.querySelector('.context-menu-overlay')).toBeNull()
    expect(container.querySelector('.context-menu')).toBeNull()
  })

  it('does not auto-select for sections with multiple items', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    // settings has 6 items - should NOT auto-select
    expect(onItemSelect).not.toHaveBeenCalled()
  })

  it('renders count without progress ring when no badgeProgress', () => {
    const { container } = render(
      <SidebarPanel
        section="settings"
        onItemSelect={onItemSelect}
        selectedItem={null}
        counts={{ 'settings-accounts': 7 }}
      />
    )
    expect(screen.getByText('7')).toBeTruthy()
    // Should not have a progress ring
    expect(container.querySelector('.sidebar-item-count-ring')).toBeNull()
  })

  it('does not show count when counts not provided for item', () => {
    const { container } = render(
      <SidebarPanel
        section="settings"
        onItemSelect={onItemSelect}
        selectedItem={null}
        counts={{}}
      />
    )
    const countElements = container.querySelectorAll('.sidebar-item-count')
    expect(countElements.length).toBe(0)
  })

  it('handles multiple sections being expanded', () => {
    const { rerender } = render(
      <SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />
    )
    expect(screen.getByText('Accounts')).toBeTruthy()

    // Switch to tasks section
    rerender(<SidebarPanel section="tasks" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Today')).toBeTruthy()

    // Switch back to settings - should still be expanded
    rerender(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Accounts')).toBeTruthy()
  })

  it('selects item via Space key on sidebar item', () => {
    render(<SidebarPanel section="tasks" onItemSelect={onItemSelect} selectedItem={null} />)
    const item = screen.getByText('Today').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: ' ' })
    expect(onItemSelect).toHaveBeenCalledWith('tasks-today')
  })

  it('does not respond to non-Enter/Space keys on section header', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const header = screen.getByText('Settings').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: 'Tab' })
    // Items should still be visible (not toggled)
    expect(screen.getByText('Accounts')).toBeTruthy()
  })

  it('does not respond to non-Enter/Space keys on sidebar items', () => {
    render(<SidebarPanel section="settings" onItemSelect={onItemSelect} selectedItem={null} />)
    const item = screen.getByText('Accounts').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: 'Tab' })
    expect(onItemSelect).not.toHaveBeenCalled()
  })
})
