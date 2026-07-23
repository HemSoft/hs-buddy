import type { ComponentProps } from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const onCloseOtherTabs = vi.fn()
  const onCloseTabsToRight = vi.fn()
  const onCloseAllTabs = vi.fn()
  const view = render(
    <TabBar
      tabs={SAMPLE_TABS}
      activeTabId="tab-1"
      onTabSelect={onTabSelect}
      onTabClose={onTabClose}
      onCloseOtherTabs={onCloseOtherTabs}
      onCloseTabsToRight={onCloseTabsToRight}
      onCloseAllTabs={onCloseAllTabs}
      {...props}
    />
  )

  return { ...view, onTabSelect, onTabClose, onCloseOtherTabs, onCloseTabsToRight, onCloseAllTabs }
}

describe('TabBar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

    expect(tabs[0].closest('.tab')).not.toHaveClass('active')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')

    expect(tabs[1].closest('.tab')).toHaveClass('active')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')

    expect(tabs[2].closest('.tab')).not.toHaveClass('active')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('has no active tab when activeTabId is null', () => {
    renderTabBar({ activeTabId: null })

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.closest('.tab')).not.toHaveClass('active')
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

  it('moves focus to the next tab on ArrowRight and wraps from the last to the first', () => {
    const { onTabSelect } = renderTabBar()
    const tabs = screen.getAllByRole('tab')

    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(tabs[1]).toHaveFocus()

    fireEvent.keyDown(tabs[1], { key: 'ArrowRight' })
    expect(tabs[2]).toHaveFocus()

    // Wraps around from the last tab back to the first
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
    expect(tabs[0]).toHaveFocus()

    // Arrow navigation only moves focus; it must not select the tab
    expect(onTabSelect).not.toHaveBeenCalled()
  })

  it('moves focus to the previous tab on ArrowLeft and wraps from the first to the last', () => {
    const { onTabSelect } = renderTabBar()
    const tabs = screen.getAllByRole('tab')

    tabs[0].focus()
    // Wraps around from the first tab back to the last
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(tabs[2]).toHaveFocus()

    fireEvent.keyDown(tabs[2], { key: 'ArrowLeft' })
    expect(tabs[1]).toHaveFocus()

    expect(onTabSelect).not.toHaveBeenCalled()
  })

  it('moves focus to the first tab on Home and the last tab on End', () => {
    renderTabBar()
    const tabs = screen.getAllByRole('tab')

    tabs[1].focus()
    fireEvent.keyDown(tabs[1], { key: 'End' })
    expect(tabs[2]).toHaveFocus()

    fireEvent.keyDown(tabs[2], { key: 'Home' })
    expect(tabs[0]).toHaveFocus()
  })

  it('gives each close button an accessible label', () => {
    renderTabBar()

    expect(screen.getByRole('button', { name: 'Close Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Profile' })).toBeInTheDocument()
  })

  it('gives only the active tab a tabIndex of 0 (roving tabindex) and inactive tabs -1', () => {
    renderTabBar({ activeTabId: 'tab-2' })
    const tabs = screen.getAllByRole('tab')

    expect(tabs[0]).toHaveAttribute('tabindex', '-1')
    expect(tabs[1]).toHaveAttribute('tabindex', '0')
    expect(tabs[2]).toHaveAttribute('tabindex', '-1')
  })

  it('falls back to making the first tab the roving tab stop when there is no active tab', () => {
    renderTabBar({ activeTabId: null })
    const tabs = screen.getAllByRole('tab')

    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    expect(tabs[2]).toHaveAttribute('tabindex', '-1')
  })

  it('renders the tab and its close button as independent, non-nested focus targets', () => {
    renderTabBar()

    const tab = screen.getByRole('tab', { name: 'Settings' })
    const closeButton = screen.getByRole('button', { name: 'Close Settings' })

    expect(tab.tagName).toBe('BUTTON')
    expect(closeButton.tagName).toBe('BUTTON')
    expect(tab.contains(closeButton)).toBe(false)
    expect(closeButton.contains(tab)).toBe(false)
  })

  it('renders the tabs inside a tablist with an accessible name', () => {
    renderTabBar()

    const tablist = screen.getByRole('tablist', { name: 'Open tabs' })
    expect(tablist).toBeInTheDocument()
    for (const tab of screen.getAllByRole('tab')) {
      expect(tablist.contains(tab)).toBe(true)
    }
  })

  it('renders a single active tab correctly', () => {
    const singleTab: Tab[] = [{ id: 'only', label: 'Only Tab', viewId: 'view-only' }]

    renderTabBar({ tabs: singleTab, activeTabId: 'only' })

    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByText('Only Tab')).toBeInTheDocument()
    expect(screen.getByRole('tab').closest('.tab')).toHaveClass('active')
  })

  describe('context menu', () => {
    it('opens a context menu on right-click', async () => {
      renderTabBar()
      const tabs = screen.getAllByRole('tab')

      fireEvent.contextMenu(tabs[1])

      expect(screen.getByRole('menu')).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Close' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Close Others' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Close to the Right' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Close All' })).toBeInTheDocument()
    })

    it('calls onTabClose for Close', async () => {
      const user = userEvent.setup()
      const { onTabClose } = renderTabBar()
      const tabs = screen.getAllByRole('tab')

      fireEvent.contextMenu(tabs[1])
      await user.click(screen.getByRole('menuitem', { name: 'Close' }))

      expect(onTabClose).toHaveBeenCalledWith('tab-2')
    })

    it('calls onCloseOtherTabs for Close Others', async () => {
      const user = userEvent.setup()
      const { onCloseOtherTabs } = renderTabBar()
      const tabs = screen.getAllByRole('tab')

      fireEvent.contextMenu(tabs[0])
      await user.click(screen.getByRole('menuitem', { name: 'Close Others' }))

      expect(onCloseOtherTabs).toHaveBeenCalledWith('tab-1')
    })

    it('calls onCloseTabsToRight for Close to the Right', async () => {
      const user = userEvent.setup()
      const { onCloseTabsToRight } = renderTabBar()
      const tabs = screen.getAllByRole('tab')

      fireEvent.contextMenu(tabs[0])
      await user.click(screen.getByRole('menuitem', { name: 'Close to the Right' }))

      expect(onCloseTabsToRight).toHaveBeenCalledWith('tab-1')
    })

    it('calls onCloseAllTabs for Close All', async () => {
      const user = userEvent.setup()
      const { onCloseAllTabs } = renderTabBar()
      const tabs = screen.getAllByRole('tab')

      fireEvent.contextMenu(tabs[0])
      await user.click(screen.getByRole('menuitem', { name: 'Close All' }))

      expect(onCloseAllTabs).toHaveBeenCalled()
    })

    it('disables Close Others when only one tab exists', () => {
      const singleTab: Tab[] = [{ id: 'only', label: 'Only Tab', viewId: 'view-only' }]
      renderTabBar({ tabs: singleTab, activeTabId: 'only' })

      fireEvent.contextMenu(screen.getByRole('tab'))

      expect(screen.getByRole('menuitem', { name: 'Close Others' })).toBeDisabled()
    })

    it('disables Close to the Right on the last tab', () => {
      renderTabBar()
      const tabs = screen.getAllByRole('tab')

      fireEvent.contextMenu(tabs[2])

      expect(screen.getByRole('menuitem', { name: 'Close to the Right' })).toBeDisabled()
    })

    it('enables Close to the Right when not the last tab', () => {
      renderTabBar()
      const tabs = screen.getAllByRole('tab')

      fireEvent.contextMenu(tabs[0])

      expect(screen.getByRole('menuitem', { name: 'Close to the Right' })).not.toBeDisabled()
    })

    it('closes the context menu when clicking the overlay', async () => {
      const user = userEvent.setup()
      renderTabBar()

      fireEvent.contextMenu(screen.getAllByRole('tab')[0])
      expect(screen.getByRole('menu')).toBeInTheDocument()

      await user.click(document.querySelector('.tab-context-menu-overlay')!)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('closes the context menu on Escape', () => {
      renderTabBar()

      fireEvent.contextMenu(screen.getAllByRole('tab')[0])
      expect(screen.getByRole('menu')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('does not close context menu for non-Escape key', () => {
      renderTabBar()

      fireEvent.contextMenu(screen.getAllByRole('tab')[0])
      expect(screen.getByRole('menu')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'a' })
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('does not fire onTabSelect for non-Enter/Space key on a tab', () => {
      const { onTabSelect } = renderTabBar()
      const tabs = screen.getAllByRole('tab')

      tabs[1].focus()
      fireEvent.keyDown(tabs[1], { key: 'ArrowRight' })

      expect(onTabSelect).not.toHaveBeenCalled()
    })

    it('adjusts context menu position when it overflows the viewport right edge', async () => {
      renderTabBar()
      const tabs = screen.getAllByRole('tab')

      // Mock viewport via Object.defineProperty (reliable in happy-dom)
      // and getBoundingClientRect BEFORE opening context menu
      const origInnerWidth = window.innerWidth
      const origInnerHeight = window.innerHeight
      Object.defineProperty(window, 'innerWidth', {
        value: 800,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'innerHeight', {
        value: 600,
        writable: true,
        configurable: true,
      })
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        right: 900,
        bottom: 200,
        width: 150,
        height: 100,
        top: 100,
        left: 750,
        x: 750,
        y: 100,
        toJSON: () => {},
      })

      fireEvent.contextMenu(tabs[0], { clientX: 780, clientY: 100 })

      await waitFor(() => {
        const menu = screen.getByRole('menu')
        // viewport(800) - menuWidth(150) - gap(4) = 646
        expect(menu.style.left).toBe('646px')
      })

      Object.defineProperty(window, 'innerWidth', {
        value: origInnerWidth,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'innerHeight', {
        value: origInnerHeight,
        writable: true,
        configurable: true,
      })
    })

    it('adjusts context menu position when it overflows the viewport bottom edge', async () => {
      renderTabBar()
      const tabs = screen.getAllByRole('tab')

      // Mock viewport via Object.defineProperty (reliable in happy-dom)
      // and getBoundingClientRect BEFORE opening context menu
      const origInnerWidth = window.innerWidth
      const origInnerHeight = window.innerHeight
      Object.defineProperty(window, 'innerWidth', {
        value: 800,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'innerHeight', {
        value: 400,
        writable: true,
        configurable: true,
      })
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        right: 250,
        bottom: 500,
        width: 150,
        height: 150,
        top: 350,
        left: 100,
        x: 100,
        y: 350,
        toJSON: () => {},
      })

      fireEvent.contextMenu(tabs[0], { clientX: 100, clientY: 350 })

      await waitFor(() => {
        const menu = screen.getByRole('menu')
        // viewport(400) - menuHeight(150) - gap(4) = 246
        expect(menu.style.top).toBe('246px')
      })

      Object.defineProperty(window, 'innerWidth', {
        value: origInnerWidth,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'innerHeight', {
        value: origInnerHeight,
        writable: true,
        configurable: true,
      })
    })
  })
})
