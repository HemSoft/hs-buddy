import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabBar, type Tab } from './TabBar'

const SAMPLE_TABS: Tab[] = [
  { id: 'tab-1', label: 'Dashboard', viewId: 'view-dashboard' },
  { id: 'tab-2', label: 'Settings', viewId: 'view-settings' },
  { id: 'tab-3', label: 'Profile', viewId: 'view-profile' },
]

function renderTabBar(props: Partial<ComponentProps<typeof TabBar>> = {}) {
  const onTabSelect = vi.fn()
  const onTabClose = vi.fn()
  const view = render(
    <TabBar
      tabs={SAMPLE_TABS}
      activeTabId="tab-1"
      onTabSelect={onTabSelect}
      onTabClose={onTabClose}
      {...props}
    />
  )

  return { ...view, onTabSelect, onTabClose }
}

describe('TabBar', () => {
  it('renders nothing when tabs array is empty', () => {
    const { container } = renderTabBar({ tabs: [] })

    expect(container.innerHTML).toBe('')
  })

  it('renders a tab element for each tab', () => {
    renderTabBar()

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('marks the active tab with the active class and aria-selected', () => {
    renderTabBar({ activeTabId: 'tab-2' })
    const tabs = screen.getAllByRole('tab')

    expect(tabs[0]).not.toHaveClass('active')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')

    expect(tabs[1]).toHaveClass('active')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')

    expect(tabs[2]).not.toHaveClass('active')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('has no active tab when activeTabId is null', () => {
    renderTabBar({ activeTabId: null })

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).not.toHaveClass('active')
      expect(tab).toHaveAttribute('aria-selected', 'false')
    }
  })

  it('calls onTabSelect with the tab id when a tab is clicked', async () => {
    const user = userEvent.setup()
    const { onTabSelect } = renderTabBar()

    await user.click(screen.getByText('Settings'))

    expect(onTabSelect).toHaveBeenCalledWith('tab-2')
  })

  it('calls onTabClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const { onTabClose } = renderTabBar()

    await user.click(screen.getByRole('button', { name: 'Close Settings' }))

    expect(onTabClose).toHaveBeenCalledWith('tab-2')
  })

  it('does not call onTabSelect when the close button is clicked', async () => {
    const user = userEvent.setup()
    const { onTabSelect, onTabClose } = renderTabBar()

    await user.click(screen.getByRole('button', { name: 'Close Dashboard' }))

    expect(onTabClose).toHaveBeenCalledWith('tab-1')
    expect(onTabSelect).not.toHaveBeenCalled()
  })

  it('selects a tab when Enter is pressed on it', () => {
    const { onTabSelect } = renderTabBar()
    const tabs = screen.getAllByRole('tab')

    tabs[1].focus()
    fireEvent.keyDown(tabs[1], { key: 'Enter' })

    expect(onTabSelect).toHaveBeenCalledWith('tab-2')
  })

  it('selects a tab when Space is pressed on it', () => {
    const { onTabSelect } = renderTabBar()
    const tabs = screen.getAllByRole('tab')

    tabs[2].focus()
    fireEvent.keyDown(tabs[2], { key: ' ' })

    expect(onTabSelect).toHaveBeenCalledWith('tab-3')
  })

  it('gives each close button an accessible label', () => {
    renderTabBar()

    expect(screen.getByRole('button', { name: 'Close Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Profile' })).toBeInTheDocument()
  })

  it('gives every tab a keyboard-focusable tabIndex of 0', () => {
    renderTabBar()

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('tabindex', '0')
    }
  })

  it('renders a single active tab correctly', () => {
    const singleTab: Tab[] = [{ id: 'only', label: 'Only Tab', viewId: 'view-only' }]

    renderTabBar({ tabs: singleTab, activeTabId: 'only' })

    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByText('Only Tab')).toBeInTheDocument()
    expect(screen.getByRole('tab')).toHaveClass('active')
  })
})
