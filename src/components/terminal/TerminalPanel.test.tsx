import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./TerminalPane', () => ({
  TerminalPane: ({ viewKey, cwd }: { viewKey: string; cwd?: string }) => (
    <div data-testid={`terminal-pane-${viewKey}`} data-cwd={cwd ?? ''}>
      mock terminal
    </div>
  ),
}))
vi.mock('./TerminalPanel.css', () => ({}))

import { TerminalPanel } from './TerminalPanel'
import type { TerminalTab } from '../../hooks/useTerminalPanel'

const makeTabs = (count: number): TerminalTab[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `tab-${i}`,
    title: `Tab ${i}`,
    cwd: `/repo/${i}`,
  }))

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
})
