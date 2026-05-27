import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalSidebar } from './TerminalSidebar'
import type { TerminalTreeNode } from '../terminal-workspace/types'

const workspace = vi.hoisted(() => ({
  nodes: [] as TerminalTreeNode[],
  activeNodeId: null as string | null,
  loaded: true,
  addNode: vi.fn(),
  renameNode: vi.fn(),
  recolorNode: vi.fn(),
  removeNode: vi.fn(),
  reorderNode: vi.fn(),
  selectNode: vi.fn(),
}))

vi.mock('../../hooks/useTerminalWorkspace', () => ({
  useTerminalWorkspace: () => workspace,
}))

function folder(id: string, name: string, sortOrder: number, color?: string): TerminalTreeNode {
  return {
    id,
    name,
    color,
    parentId: null,
    sortOrder,
    layout: { type: 'pane', id: `pane-${id}`, cwd: '' },
  }
}

function terminal(id: string, name: string, parentId: string, sortOrder: number): TerminalTreeNode {
  return {
    id,
    name,
    parentId,
    sortOrder,
    layout: { type: 'pane', id: `pane-${id}`, cwd: '' },
  }
}

describe('TerminalSidebar', () => {
  const onItemSelect = vi.fn()

  beforeEach(() => {
    workspace.nodes = []
    workspace.activeNodeId = null
    workspace.loaded = true
    workspace.addNode.mockReset()
    workspace.renameNode.mockReset()
    workspace.recolorNode.mockReset()
    workspace.removeNode.mockReset()
    workspace.reorderNode.mockReset()
    workspace.selectNode.mockReset()
    onItemSelect.mockReset()
  })

  it('renders loading and empty states', () => {
    workspace.loaded = false
    const { rerender } = render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    workspace.loaded = true
    rerender(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    expect(screen.getByRole('button', { name: '+ New Project' })).toBeInTheDocument()
  })

  it('adds projects and terminals', () => {
    workspace.nodes = [folder('folder-1', 'Project 1', 1)]
    workspace.addNode
      .mockReturnValueOnce(folder('folder-2', 'Project 2', 2))
      .mockReturnValueOnce(terminal('terminal-1', 'Terminal 1', 'folder-1', 1))

    render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Terminal' }))

    expect(workspace.addNode).toHaveBeenNthCalledWith(1, 'Project 2')
    expect(workspace.addNode).toHaveBeenNthCalledWith(2, 'Terminal 1', { parentId: 'folder-1' })
    expect(workspace.selectNode).toHaveBeenCalledWith('terminal-1')
    expect(onItemSelect).toHaveBeenCalledWith('terminal-workspace')
  })

  it('selects, collapses, expands, and keyboard-activates nodes', () => {
    workspace.nodes = [
      folder('folder-1', 'Project 1', 1, '#4ec9b0'),
      terminal('terminal-1', 'Shell', 'folder-1', 1),
    ]
    workspace.activeNodeId = 'terminal-1'

    render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem="terminal-workspace" />)

    fireEvent.click(screen.getByRole('button', { name: 'Project: Project 1' }))
    expect(workspace.selectNode).toHaveBeenCalledWith('folder-1')

    fireEvent.click(screen.getByRole('button', { name: 'Terminal: Shell' }))
    expect(workspace.selectNode).toHaveBeenCalledWith('terminal-1')

    fireEvent.keyDown(screen.getByRole('button', { name: 'Project: Project 1' }), { key: 'Enter' })
    expect(workspace.selectNode).toHaveBeenCalledWith('folder-1')

    fireEvent.keyDown(screen.getByRole('button', { name: 'Terminal: Shell' }), { key: ' ' })
    expect(workspace.selectNode).toHaveBeenCalledWith('terminal-1')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByRole('button', { name: 'Terminal: Shell' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByRole('button', { name: 'Terminal: Shell' })).toBeInTheDocument()
  })

  it('renames nodes from double click and context menu', () => {
    workspace.nodes = [
      folder('folder-1', 'Project 1', 1),
      terminal('terminal-1', 'Shell', 'folder-1', 1),
    ]

    render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Terminal: Shell' }))
    const shellInput = screen.getByDisplayValue('Shell')
    fireEvent.click(shellInput)
    fireEvent.change(shellInput, { target: { value: 'Logs' } })
    fireEvent.keyDown(shellInput, { key: 'Enter' })
    expect(workspace.renameNode).toHaveBeenCalledWith('terminal-1', 'Logs')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Project: Project 1' }), {
      clientX: 10,
      clientY: 20,
    })
    fireEvent.click(screen.getByRole('button', { name: /Rename/ }))
    const projectInput = screen.getByDisplayValue('Project 1')
    fireEvent.change(projectInput, { target: { value: 'Build' } })
    fireEvent.click(projectInput)
    fireEvent.blur(projectInput)
    expect(workspace.renameNode).toHaveBeenCalledWith('folder-1', 'Build')
  })

  it('cancels empty or escaped rename edits', () => {
    workspace.nodes = [folder('folder-1', 'Project 1', 1)]

    render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Project: Project 1' }))
    const input = screen.getByDisplayValue('Project 1')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(workspace.renameNode).not.toHaveBeenCalled()

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Project: Project 1' }))
    const escapeInput = screen.getByDisplayValue('Project 1')
    fireEvent.keyDown(escapeInput, { key: 'Tab' })
    expect(screen.getByDisplayValue('Project 1')).toBeInTheDocument()
    fireEvent.keyDown(escapeInput, { key: 'Escape' })
    expect(screen.queryByDisplayValue('Project 1')).toBeNull()
  })

  it('recolors and deletes through the context menu', () => {
    workspace.nodes = [folder('folder-1', 'Project 1', 1)]

    render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Project: Project 1' }), {
      clientX: 10,
      clientY: 20,
    })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('button', { name: /Change Color/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Color: #569cd6' }))
    expect(workspace.recolorNode).toHaveBeenCalledWith('folder-1', '#569cd6')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Project: Project 1' }), {
      clientX: 10,
      clientY: 20,
    })
    fireEvent.click(screen.getByRole('button', { name: /Change Color/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove color' }))
    expect(workspace.recolorNode).toHaveBeenCalledWith('folder-1', undefined)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Project: Project 1' }), {
      clientX: 10,
      clientY: 20,
    })
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))
    expect(workspace.removeNode).toHaveBeenCalledWith('folder-1')
  })

  it('shows empty terminal affordance and reorders dropped terminals', () => {
    workspace.nodes = [
      folder('folder-1', 'Project 1', 1),
      folder('folder-2', 'Project 2', 2),
      terminal('terminal-1', 'Shell', 'folder-2', 5),
      terminal('terminal-2', 'Logs', 'folder-2', 10),
    ]
    workspace.addNode.mockReturnValue(terminal('terminal-new', 'Terminal 1', 'folder-1', 1))

    render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Terminal' }))
    expect(workspace.addNode).toHaveBeenCalledWith('Terminal 1', { parentId: 'folder-1' })

    const source = screen.getByRole('button', { name: 'Terminal: Shell' })
    const target = screen.getByRole('button', { name: 'Terminal: Logs' })
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    }
    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'terminal-1')
    expect(workspace.reorderNode).toHaveBeenCalledWith('terminal-1', 9.5)

    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.drop(source, { dataTransfer })
    expect(workspace.reorderNode).toHaveBeenCalledTimes(1)
  })

  it('does not mark an active folder selected while another sidebar item is active', () => {
    workspace.nodes = [folder('folder-1', 'Project 1', 1)]
    workspace.activeNodeId = 'folder-1'

    render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem="dashboard" />)

    expect(screen.getByRole('button', { name: 'Project: Project 1' })).not.toHaveClass('selected')
  })

  it('opens context menu for terminals and ignores rename when the node is gone', () => {
    workspace.nodes = [
      folder('folder-1', 'Project 1', 1),
      terminal('terminal-1', 'Shell', 'folder-1', 1),
    ]

    render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Terminal: Shell' }), {
      clientX: 10,
      clientY: 20,
    })

    workspace.nodes = [folder('folder-1', 'Project 1', 1)]
    fireEvent.click(screen.getByRole('button', { name: /Rename/ }))
    expect(workspace.renameNode).not.toHaveBeenCalled()
  })

  describe('EditableNodeName sub-component', () => {
    it('shows a plain label when not in edit mode', () => {
      workspace.nodes = [folder('folder-1', 'My Project', 1)]

      render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)

      expect(screen.getByText('My Project')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('shows an input when entering edit mode and commits on Enter', () => {
      workspace.nodes = [folder('folder-1', 'My Project', 1)]

      render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)

      fireEvent.doubleClick(screen.getByRole('button', { name: 'Project: My Project' }))
      const input = screen.getByDisplayValue('My Project')
      expect(input).toBeInTheDocument()

      fireEvent.change(input, { target: { value: 'Renamed' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(workspace.renameNode).toHaveBeenCalledWith('folder-1', 'Renamed')
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('cancels edit on Escape without renaming', () => {
      workspace.nodes = [folder('folder-1', 'My Project', 1)]

      render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)

      fireEvent.doubleClick(screen.getByRole('button', { name: 'Project: My Project' }))
      const input = screen.getByDisplayValue('My Project')
      fireEvent.change(input, { target: { value: 'Something' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(workspace.renameNode).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).toBeNull()
    })
  })

  describe('TerminalChildrenList sub-component', () => {
    it('shows empty-state button when folder has no children', () => {
      workspace.nodes = [folder('folder-1', 'Empty Project', 1)]
      workspace.addNode.mockReturnValue(terminal('t-new', 'Terminal 1', 'folder-1', 1))

      render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)

      const addBtn = screen.getByRole('button', { name: '+ Add Terminal' })
      expect(addBtn).toBeInTheDocument()

      fireEvent.click(addBtn)
      expect(workspace.addNode).toHaveBeenCalledWith('Terminal 1', { parentId: 'folder-1' })
    })

    it('hides children when folder is collapsed', () => {
      workspace.nodes = [
        folder('folder-1', 'Project 1', 1),
        terminal('terminal-1', 'Shell', 'folder-1', 1),
      ]

      render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)
      expect(screen.getByRole('button', { name: 'Terminal: Shell' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
      expect(screen.queryByRole('button', { name: 'Terminal: Shell' })).toBeNull()
    })
  })

  describe('TerminalSidebarLoading sub-component', () => {
    it('renders loading indicator when workspace is not loaded', () => {
      workspace.loaded = false

      render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)

      expect(screen.getByText('Loading…')).toBeInTheDocument()
      expect(screen.getByText('Projects')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add Project' })).toBeNull()
    })
  })

  describe('TerminalFolderList sub-component', () => {
    it('renders new project button when no folders exist', () => {
      workspace.nodes = []

      render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)

      expect(screen.getByRole('button', { name: '+ New Project' })).toBeInTheDocument()
    })

    it('renders multiple folders sorted by sortOrder', () => {
      workspace.nodes = [folder('folder-b', 'Beta', 2), folder('folder-a', 'Alpha', 1)]

      render(<TerminalSidebar onItemSelect={onItemSelect} selectedItem={null} />)

      const buttons = screen.getAllByRole('button', { name: /Project:/ })
      expect(buttons[0]).toHaveAttribute('aria-label', 'Project: Alpha')
      expect(buttons[1]).toHaveAttribute('aria-label', 'Project: Beta')
    })
  })
})
