import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./TerminalPane', () => ({
  TerminalPane: ({
    viewKey,
    cwd,
    onCwdChange,
  }: {
    viewKey: string
    cwd?: string
    onCwdChange?: (cwd: string) => void
  }) => (
    <div data-testid={`terminal-pane-${viewKey}`} data-cwd={cwd ?? ''}>
      <button data-testid="cwd-change-trigger" onClick={() => onCwdChange?.('/new/path')}>
        change cwd
      </button>
      mock terminal
    </div>
  ),
}))
vi.mock('./TerminalPanel.css', () => ({}))
vi.mock('./TerminalTabContextMenu.css', () => ({}))

import { TerminalPanel } from './TerminalPanel'
import type { TerminalTab } from '../../hooks/useTerminalPanel'

const makeTabs = (count: number): TerminalTab[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `tab-${i}`,
    title: `Tab ${i}`,
    cwd: `/repo/${i}`,
  }))

const defaultHandlers = {
  onRenameTab: vi.fn(),
  onSetTabColor: vi.fn(),
  onReorderTabs: vi.fn(),
  onTabCwdChange: vi.fn(),
  onOpenFolderView: vi.fn(),
}

describe('TerminalPanel', () => {
  afterEach(cleanup)

  it('renders tab buttons for each tab', () => {
    const tabs = makeTabs(3)
    render(
      <TerminalPanel
        tabs={tabs}
        activeTabId="tab-0"
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    expect(screen.getByText('Tab 0')).toBeInTheDocument()
    expect(screen.getByText('Tab 1')).toBeInTheDocument()
    expect(screen.getByText('Tab 2')).toBeInTheDocument()
  })

  it('marks active tab with "active" class', () => {
    const tabs = makeTabs(2)
    render(
      <TerminalPanel
        tabs={tabs}
        activeTabId="tab-1"
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    const activeTab = screen.getByText('Tab 1').closest('.terminal-panel-tab')
    expect(activeTab?.className).toContain('active')

    const inactiveTab = screen.getByText('Tab 0').closest('.terminal-panel-tab')
    expect(inactiveTab?.className).not.toContain('active')
  })

  it('calls onTabSelect when clicking a tab', () => {
    const onTabSelect = vi.fn()
    const tabs = makeTabs(2)
    render(
      <TerminalPanel
        tabs={tabs}
        activeTabId="tab-0"
        onTabSelect={onTabSelect}
        onTabClose={vi.fn()}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    fireEvent.click(screen.getByText('Tab 1'))
    expect(onTabSelect).toHaveBeenCalledWith('tab-1')
  })

  it('calls onTabClose when clicking the close button', () => {
    const onTabClose = vi.fn()
    const tabs = makeTabs(1)
    render(
      <TerminalPanel
        tabs={tabs}
        activeTabId="tab-0"
        onTabSelect={vi.fn()}
        onTabClose={onTabClose}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    const closeBtn = document.querySelector('.terminal-panel-tab-close')
    expect(closeBtn).toBeInTheDocument()
    fireEvent.click(closeBtn!)
    expect(onTabClose).toHaveBeenCalledWith('tab-0')
  })

  it('calls onAddTab when clicking the + button', () => {
    const onAddTab = vi.fn()
    render(
      <TerminalPanel
        tabs={[]}
        activeTabId={null}
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
        onAddTab={onAddTab}
        {...defaultHandlers}
      />
    )

    fireEvent.click(screen.getByTitle('New Terminal'))
    expect(onAddTab).toHaveBeenCalledOnce()
  })

  it('shows empty message when no active tab', () => {
    render(
      <TerminalPanel
        tabs={[]}
        activeTabId={null}
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    expect(screen.getByText(/No terminal sessions/)).toBeInTheDocument()
  })

  it('renders TerminalPane for the active tab', async () => {
    const tabs = makeTabs(2)
    render(
      <TerminalPanel
        tabs={tabs}
        activeTabId="tab-1"
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    expect(await screen.findByTestId('terminal-pane-tab-1')).toBeInTheDocument()
  })

  it('close button does not propagate click to tab select', () => {
    const onTabSelect = vi.fn()
    const onTabClose = vi.fn()
    const tabs = makeTabs(1)
    render(
      <TerminalPanel
        tabs={tabs}
        activeTabId="tab-0"
        onTabSelect={onTabSelect}
        onTabClose={onTabClose}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    const closeBtn = document.querySelector('.terminal-panel-tab-close')
    fireEvent.click(closeBtn!)

    // onTabClose should be called, but not onTabSelect
    expect(onTabClose).toHaveBeenCalledWith('tab-0')
    expect(onTabSelect).not.toHaveBeenCalled()
  })

  it('close button is an accessible button element', () => {
    const tabs = makeTabs(1)
    render(
      <TerminalPanel
        tabs={tabs}
        activeTabId="tab-0"
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    const closeBtn = screen.getByRole('button', { name: 'Close Tab 0' })
    expect(closeBtn).toBeInTheDocument()
    expect(closeBtn.tagName).toBe('BUTTON')
  })

  it('close button has no redundant keydown handler (native button handles it)', () => {
    const onTabClose = vi.fn()
    const tabs = makeTabs(1)
    render(
      <TerminalPanel
        tabs={tabs}
        activeTabId="tab-0"
        onTabSelect={vi.fn()}
        onTabClose={onTabClose}
        onAddTab={vi.fn()}
        {...defaultHandlers}
      />
    )

    const closeBtn = document.querySelector('.terminal-panel-tab-close')!
    // keyDown alone should NOT trigger close — native buttons convert
    // Enter/Space to click events, which happy-dom doesn't simulate.
    fireEvent.keyDown(closeBtn, { key: 'Enter' })
    expect(onTabClose).not.toHaveBeenCalled()

    // But click still works
    fireEvent.click(closeBtn)
    expect(onTabClose).toHaveBeenCalledWith('tab-0')
  })

  describe('drag and drop', () => {
    const mockDataTransfer = () => ({ effectAllowed: '', dropEffect: '' })

    it('applies drag-over class during dragOver', () => {
      const tabs = makeTabs(2)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      const tab1 = screen.getByText('Tab 1').closest('.terminal-panel-tab')!
      fireEvent.dragOver(tab1, { dataTransfer: mockDataTransfer() })
      expect(tab1.className).toContain('drag-over')
    })

    it('calls onReorderTabs on drop with different tab', () => {
      const onReorderTabs = vi.fn()
      const tabs = makeTabs(2)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
          onReorderTabs={onReorderTabs}
        />
      )

      const tab0 = screen.getByText('Tab 0').closest('.terminal-panel-tab')!
      const tab1 = screen.getByText('Tab 1').closest('.terminal-panel-tab')!

      fireEvent.dragStart(tab0, { dataTransfer: mockDataTransfer() })
      fireEvent.dragOver(tab1, { dataTransfer: mockDataTransfer() })
      fireEvent.drop(tab1, { dataTransfer: mockDataTransfer() })

      expect(onReorderTabs).toHaveBeenCalledWith('tab-0', 'tab-1')
    })

    it('does not reorder when dropping on same tab', () => {
      const onReorderTabs = vi.fn()
      const tabs = makeTabs(2)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
          onReorderTabs={onReorderTabs}
        />
      )

      const tab0 = screen.getByText('Tab 0').closest('.terminal-panel-tab')!
      fireEvent.dragStart(tab0, { dataTransfer: mockDataTransfer() })
      fireEvent.drop(tab0, { dataTransfer: mockDataTransfer() })

      expect(onReorderTabs).not.toHaveBeenCalled()
    })

    it('removes drag-over class on dragEnd', () => {
      const tabs = makeTabs(2)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      const tab1 = screen.getByText('Tab 1').closest('.terminal-panel-tab')!
      fireEvent.dragOver(tab1, { dataTransfer: mockDataTransfer() })
      expect(tab1.className).toContain('drag-over')

      fireEvent.dragEnd(tab1)
      expect(tab1.className).not.toContain('drag-over')
    })

    it('resets drag state on drop', () => {
      const tabs = makeTabs(2)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      const tab0 = screen.getByText('Tab 0').closest('.terminal-panel-tab')!
      const tab1 = screen.getByText('Tab 1').closest('.terminal-panel-tab')!

      fireEvent.dragStart(tab0, { dataTransfer: mockDataTransfer() })
      fireEvent.dragOver(tab1, { dataTransfer: mockDataTransfer() })
      expect(tab1.className).toContain('drag-over')

      fireEvent.drop(tab1, { dataTransfer: mockDataTransfer() })
      expect(tab1.className).not.toContain('drag-over')
      expect(tab0.className).not.toContain('drag-over')
    })
  })

  describe('tab colors', () => {
    it('shows color dot when tab has color', () => {
      const tabs: TerminalTab[] = [
        { id: 'tab-0', title: 'Tab 0', cwd: '/repo/0', color: '#ff0000' },
      ]
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      expect(document.querySelector('.terminal-panel-tab-color-dot')).toBeInTheDocument()
    })

    it('applies --tab-color CSS variable', () => {
      const tabs: TerminalTab[] = [
        { id: 'tab-0', title: 'Tab 0', cwd: '/repo/0', color: '#ff0000' },
      ]
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      const tabEl = screen.getByText('Tab 0').closest('.terminal-panel-tab') as HTMLElement
      expect(tabEl.style.getPropertyValue('--tab-color')).toBe('#ff0000')
    })
  })

  describe('onCwdChange callback', () => {
    it('passes cwd change to onTabCwdChange handler', async () => {
      const onTabCwdChange = vi.fn()
      const tabs = makeTabs(1)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
          onTabCwdChange={onTabCwdChange}
        />
      )

      const trigger = await screen.findByTestId('cwd-change-trigger')
      fireEvent.click(trigger)
      expect(onTabCwdChange).toHaveBeenCalledWith('tab-0', '/new/path')
    })
  })

  describe('context menu lifecycle', () => {
    it('opens context menu on right-click', () => {
      const tabs = makeTabs(2)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      const tab0 = screen.getByText('Tab 0').closest('.terminal-panel-tab')!
      fireEvent.contextMenu(tab0)

      expect(screen.getByText('Rename')).toBeInTheDocument()
    })

    it('hides context menu when active tab changes', () => {
      const tabs = makeTabs(2)
      const { rerender } = render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      const tab0 = screen.getByText('Tab 0').closest('.terminal-panel-tab')!
      fireEvent.contextMenu(tab0)
      expect(screen.getByText('Rename')).toBeInTheDocument()

      // Switch to a different tab
      rerender(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-1"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      expect(screen.queryByText('Rename')).not.toBeInTheDocument()
    })

    it('does not resurrect context menu after tab round-trip', () => {
      const tabs = makeTabs(3)
      const { rerender } = render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      // Open context menu on tab-0
      const tab0 = screen.getByText('Tab 0').closest('.terminal-panel-tab')!
      fireEvent.contextMenu(tab0)
      expect(screen.getByText('Rename')).toBeInTheDocument()

      // Switch away to tab-1 (simulates add-tab making a new tab active)
      rerender(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-1"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )
      expect(screen.queryByText('Rename')).not.toBeInTheDocument()

      // Switch back to tab-0 (simulates closing the new tab, returning to original)
      rerender(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      // Context menu must NOT reappear
      expect(screen.queryByText('Rename')).not.toBeInTheDocument()
    })

    it('closes context menu when clicking a tab', () => {
      const onTabSelect = vi.fn()
      const tabs = makeTabs(2)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={onTabSelect}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      const tab0 = screen.getByText('Tab 0').closest('.terminal-panel-tab')!
      fireEvent.contextMenu(tab0)
      expect(screen.getByText('Rename')).toBeInTheDocument()

      // Click a different tab
      fireEvent.click(screen.getByText('Tab 1'))
      expect(onTabSelect).toHaveBeenCalledWith('tab-1')
      expect(screen.queryByText('Rename')).not.toBeInTheDocument()
    })

    it('closes context menu via overlay click', () => {
      const tabs = makeTabs(1)
      render(
        <TerminalPanel
          tabs={tabs}
          activeTabId="tab-0"
          onTabSelect={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
          {...defaultHandlers}
        />
      )

      const tab0 = screen.getByText('Tab 0').closest('.terminal-panel-tab')!
      fireEvent.contextMenu(tab0)
      expect(screen.getByText('Rename')).toBeInTheDocument()

      // Click the overlay to close
      const overlay = document.querySelector('.terminal-ctx-overlay')!
      fireEvent.click(overlay)
      expect(screen.queryByText('Rename')).not.toBeInTheDocument()
    })
  })
})
