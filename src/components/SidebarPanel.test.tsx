import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarPanel } from './SidebarPanel'

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

  it('renders tempo section', () => {
    render(<SidebarPanel section="tempo" onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Timesheet')).toBeTruthy()
  })
})
