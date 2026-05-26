import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalWorkspaceView } from './TerminalWorkspaceView'
import type { TerminalTreeNode } from './types'

const workspace = vi.hoisted(() => ({
  activeNode: null as TerminalTreeNode | null,
  addNode: vi.fn(),
  selectNode: vi.fn(),
  splitPaneInNode: vi.fn(),
  closePaneInNode: vi.fn(),
  updatePaneCwdInNode: vi.fn(),
}))

vi.mock('../../hooks/useTerminalWorkspace', () => ({
  useTerminalWorkspace: () => workspace,
}))

vi.mock('../terminal/TerminalPane', () => ({
  TerminalPane: ({
    viewKey,
    cwd,
    onCwdChange,
  }: {
    viewKey: string
    cwd?: string
    onCwdChange: (cwd: string) => void
  }) => (
    <button
      type="button"
      data-testid={`terminal-pane-${viewKey}`}
      onClick={() => onCwdChange('D:/next')}
    >
      {cwd ?? 'no-cwd'}
    </button>
  ),
}))

describe('TerminalWorkspaceView', () => {
  beforeEach(() => {
    workspace.activeNode = null
    workspace.addNode.mockReset()
    workspace.selectNode.mockReset()
    workspace.splitPaneInNode.mockReset()
    workspace.closePaneInNode.mockReset()
    workspace.updatePaneCwdInNode.mockReset()
  })

  it('creates and selects a first project from the empty state', () => {
    workspace.addNode.mockReturnValue({ id: 'node-1' })

    render(<TerminalWorkspaceView />)
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))

    expect(workspace.addNode).toHaveBeenCalledWith('Project 1')
    expect(workspace.selectNode).toHaveBeenCalledWith('node-1')
  })

  it('renders a single pane and disables close while allowing splits and cwd updates', async () => {
    workspace.activeNode = {
      id: 'node-1',
      name: 'Dev Server',
      color: '#4ec9b0',
      parentId: null,
      sortOrder: 1,
      layout: { type: 'pane', id: 'pane-1', cwd: 'D:/repo' },
    }

    render(<TerminalWorkspaceView />)

    expect(screen.getByText('Dev Server')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Split terminal right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Split terminal down' }))
    expect(screen.getByRole('button', { name: 'Close terminal pane' })).toBeDisabled()

    await waitFor(() => expect(screen.getByTestId('terminal-pane-pane-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('terminal-pane-pane-1'))

    expect(workspace.splitPaneInNode).toHaveBeenNthCalledWith(1, 'node-1', 'pane-1', 'horizontal')
    expect(workspace.splitPaneInNode).toHaveBeenNthCalledWith(2, 'node-1', 'pane-1', 'vertical')
    expect(workspace.updatePaneCwdInNode).toHaveBeenCalledWith('node-1', 'pane-1', 'D:/next')
  })

  it('renders nested splits and closes panes when multiple panes exist', async () => {
    workspace.activeNode = {
      id: 'node-1',
      name: 'Workspace',
      parentId: null,
      sortOrder: 1,
      layout: {
        type: 'split',
        direction: 'horizontal',
        sizes: [70],
        children: [
          { type: 'pane', id: 'pane-1', cwd: '' },
          {
            type: 'split',
            direction: 'vertical',
            sizes: [50, 50],
            children: [
              { type: 'pane', id: 'pane-2', cwd: '' },
              { type: 'pane', id: 'pane-3', cwd: '' },
            ],
          },
        ],
      },
    }

    render(<TerminalWorkspaceView />)

    await waitFor(() => expect(screen.getByTestId('terminal-pane-pane-3')).toBeInTheDocument())
    const closeButtons = screen.getAllByRole('button', { name: 'Close terminal pane' })
    expect(closeButtons[0]).toBeEnabled()
    fireEvent.click(closeButtons[1])

    expect(workspace.closePaneInNode).toHaveBeenCalledWith('node-1', 'pane-2')
  })
})
