import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTerminalWorkspace, TerminalWorkspaceProvider } from './useTerminalWorkspace'
import type { ReactNode } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { killTerminalSession } from '../components/terminal/terminalSessions'
import type { TerminalLayout } from '../components/terminal-workspace/types'

const mocks = vi.hoisted(() => ({
  queryValue: null as unknown,
  saveWorkspace: vi.fn().mockResolvedValue(undefined),
}))

// Mock Convex — vi.mock is hoisted, so we can't reference module-level variables inside
vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => mocks.queryValue),
  useMutation: vi.fn(() => mocks.saveWorkspace),
}))

// Mock terminal sessions
vi.mock('../components/terminal/terminalSessions', () => ({
  killTerminalSession: vi.fn(),
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <TerminalWorkspaceProvider>{children}</TerminalWorkspaceProvider>
)

describe('useTerminalWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mocks.queryValue = null
    mocks.saveWorkspace = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useQuery).mockImplementation(() => mocks.queryValue)
    vi.mocked(useMutation).mockImplementation(
      () => mocks.saveWorkspace as unknown as ReturnType<typeof useMutation>
    )
  })

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useTerminalWorkspace())).toThrow(
      'useTerminalWorkspace must be used within a TerminalWorkspaceProvider'
    )
  })

  it('starts with empty state and loaded=true when Convex returns null', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })
    expect(result.current.nodes).toEqual([])
    expect(result.current.activeNodeId).toBeNull()
    expect(result.current.activeNode).toBeNull()
    expect(result.current.loaded).toBe(true)
  })

  it('addNode creates a new node and sets it active', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Dev Server')
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].name).toBe('Dev Server')
    expect(result.current.activeNodeId).toBe(result.current.nodes[0].id)
    expect(result.current.activeNode).toBe(result.current.nodes[0])
  })

  it('addNode with color option', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Build', { color: '#ff0000' })
    })

    expect(result.current.nodes[0].color).toBe('#ff0000')
  })

  it('renameNode updates the node name', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Old Name')
    })
    const nodeId = result.current.nodes[0].id

    act(() => {
      result.current.renameNode(nodeId, 'New Name')
    })

    expect(result.current.nodes[0].name).toBe('New Name')
  })

  it('renameNode ignores empty strings', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Keep Me')
    })
    const nodeId = result.current.nodes[0].id

    act(() => {
      result.current.renameNode(nodeId, '   ')
    })

    expect(result.current.nodes[0].name).toBe('Keep Me')
  })

  it('recolorNode updates the node color', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Colored')
    })
    const nodeId = result.current.nodes[0].id

    act(() => {
      result.current.recolorNode(nodeId, '#00ff00')
    })

    expect(result.current.nodes[0].color).toBe('#00ff00')
  })

  it('removeNode removes the node and updates active', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('First')
    })
    act(() => {
      result.current.addNode('Second')
    })

    const firstId = result.current.nodes[0].id
    const secondId = result.current.nodes[1].id

    // Active should be 'Second' (last added)
    expect(result.current.activeNodeId).toBe(secondId)

    act(() => {
      result.current.removeNode(secondId)
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].id).toBe(firstId)
    expect(result.current.activeNodeId).toBe(firstId)
  })

  it('selectNode updates activeNodeId', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('A')
    })
    act(() => {
      result.current.addNode('B')
    })

    const firstId = result.current.nodes[0].id

    act(() => {
      result.current.selectNode(firstId)
    })

    expect(result.current.activeNodeId).toBe(firstId)
  })

  it('splitPaneInNode splits the layout', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Split Test')
    })

    const nodeId = result.current.nodes[0].id
    const paneId = (result.current.nodes[0].layout as { id: string }).id

    act(() => {
      result.current.splitPaneInNode(nodeId, paneId, 'horizontal')
    })

    const layout = result.current.nodes[0].layout
    expect(layout.type).toBe('split')
    if (layout.type === 'split') {
      expect(layout.direction).toBe('horizontal')
      expect(layout.children).toHaveLength(2)
    }
  })

  it('closePaneInNode removes a pane from split', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Close Test')
    })

    const nodeId = result.current.nodes[0].id
    const paneId = (result.current.nodes[0].layout as { id: string }).id

    // First split
    act(() => {
      result.current.splitPaneInNode(nodeId, paneId, 'vertical')
    })

    // Get the second pane id
    const splitLayout = result.current.nodes[0].layout
    expect(splitLayout.type).toBe('split')
    if (splitLayout.type === 'split') {
      const secondPaneId = (splitLayout.children[1] as { id: string }).id

      act(() => {
        result.current.closePaneInNode(nodeId, secondPaneId)
      })

      // Should simplify back to a single pane
      expect(result.current.nodes[0].layout.type).toBe('pane')
    }
  })

  it('updatePaneCwdInNode updates pane cwd', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('CWD Test')
    })

    const nodeId = result.current.nodes[0].id
    const paneId = (result.current.nodes[0].layout as { id: string }).id

    act(() => {
      result.current.updatePaneCwdInNode(nodeId, paneId, '/new/path')
    })

    expect((result.current.nodes[0].layout as { cwd: string }).cwd).toBe('/new/path')
  })

  it('falls back to loaded when Convex stays unresolved', () => {
    vi.useFakeTimers()
    mocks.queryValue = undefined

    const { result, unmount } = renderHook(() => useTerminalWorkspace(), { wrapper })
    expect(result.current.loaded).toBe(false)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.loaded).toBe(true)
    unmount()
  })

  it('does not run unresolved Convex fallback after unmount', () => {
    vi.useFakeTimers()
    mocks.queryValue = undefined

    const { result, unmount } = renderHook(() => useTerminalWorkspace(), { wrapper })
    unmount()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.loaded).toBe(false)
  })

  it('restores saved workspace data from Convex', () => {
    const layout: TerminalLayout = { type: 'pane', id: 'pane-restored', cwd: 'D:/repo' }
    mocks.queryValue = {
      nodes: [
        {
          id: 'node-restored',
          name: 'Restored',
          color: null,
          parentId: undefined,
          sortOrder: 7,
          layout,
        },
      ],
      activeNodeId: undefined,
    }

    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    expect(result.current.loaded).toBe(true)
    expect(result.current.nodes).toEqual([
      {
        id: 'node-restored',
        name: 'Restored',
        color: undefined,
        parentId: null,
        sortOrder: 7,
        layout,
      },
    ])
    expect(result.current.activeNodeId).toBeNull()
  })

  it('persists updates with normalized optional fields', async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Persist Me')
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mocks.saveWorkspace).toHaveBeenCalledWith({
      nodes: [
        expect.objectContaining({
          name: 'Persist Me',
          color: undefined,
          parentId: undefined,
        }),
      ],
      activeNodeId: expect.stringMatching(/^terminal-node-/),
    })

    mocks.saveWorkspace.mockClear()
    act(() => {
      result.current.selectNode(null as unknown as string)
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.saveWorkspace).toHaveBeenCalledWith({
      nodes: expect.any(Array),
      activeNodeId: undefined,
    })

    mocks.saveWorkspace.mockRejectedValueOnce(new Error('nope'))
    act(() => {
      result.current.selectNode(result.current.nodes[0].id)
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    await Promise.resolve()
    unmount()
  })

  it('removes folders with descendants and kills every pane session', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Project')
    })
    const folderId = result.current.nodes[0].id
    act(() => {
      result.current.addNode('Terminal', { parentId: folderId })
    })
    const childId = result.current.nodes[1].id
    const childPaneId = (result.current.nodes[1].layout as { id: string }).id
    act(() => {
      result.current.selectNode(childId)
      result.current.removeNode(folderId)
    })

    expect(result.current.nodes).toEqual([])
    expect(result.current.activeNodeId).toBeNull()
    expect(killTerminalSession).toHaveBeenCalledWith(childPaneId)
  })

  it('leaves active selection when removing an inactive node', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('A')
      result.current.addNode('B')
    })
    const firstId = result.current.nodes[0].id
    const secondId = result.current.nodes[1].id

    act(() => {
      result.current.removeNode(firstId)
    })

    expect(result.current.activeNodeId).toBe(secondId)
  })

  it('reorders nodes and updates full layouts', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('A')
    })
    const nodeId = result.current.nodes[0].id
    const layout: TerminalLayout = { type: 'pane', id: 'replacement', cwd: 'D:/next' }

    act(() => {
      result.current.reorderNode(nodeId, 42)
      result.current.updateLayoutSizes(nodeId, layout)
    })

    expect(result.current.nodes[0].sortOrder).toBe(42)
    expect(result.current.nodes[0].layout).toBe(layout)
  })

  it('ignores layout changes for non-matching nodes and panes', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('A')
    })
    const original = result.current.nodes[0].layout

    act(() => {
      result.current.renameNode('missing-node', 'Nope')
      result.current.recolorNode('missing-node', '#fff')
      result.current.reorderNode('missing-node', 99)
      result.current.splitPaneInNode('missing-node', 'missing-pane', 'horizontal')
      result.current.splitPaneInNode(result.current.nodes[0].id, 'missing-pane', 'horizontal')
      result.current.closePaneInNode('missing-node', 'missing-pane')
      result.current.updatePaneCwdInNode('missing-node', 'missing-pane', 'D:/nope')
      result.current.updateLayoutSizes('missing-node', { type: 'pane', id: 'x', cwd: '' })
    })

    expect(result.current.nodes[0].layout).toBe(original)
  })

  it('moves panes between nodes and handles no-op cases', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Source')
      result.current.addNode('Target')
    })
    const sourceId = result.current.nodes[0].id
    const targetId = result.current.nodes[1].id
    const sourcePaneId = (result.current.nodes[0].layout as { id: string }).id
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000005')

    act(() => {
      result.current.updatePaneCwdInNode(sourceId, sourcePaneId, 'D:/source')
      result.current.movePaneToNode(sourcePaneId, sourceId, sourceId)
      result.current.movePaneToNode(sourcePaneId, 'missing', targetId)
      result.current.movePaneToNode(sourcePaneId, sourceId, targetId)
    })

    const sourceLayout = result.current.nodes.find(n => n.id === sourceId)?.layout
    const targetLayout = result.current.nodes.find(n => n.id === targetId)?.layout

    expect(sourceLayout).toMatchObject({
      type: 'pane',
      id: 'pane-00000000-0000-4000-8000-000000000005',
    })
    expect(targetLayout).toMatchObject({
      type: 'split',
      direction: 'vertical',
      children: [expect.any(Object), { type: 'pane', id: sourcePaneId, cwd: 'D:/source' }],
    })
  })

  it('moves nested panes and preserves the first non-empty cwd it finds', () => {
    const { result } = renderHook(() => useTerminalWorkspace(), { wrapper })

    act(() => {
      result.current.addNode('Source')
    })
    act(() => {
      result.current.addNode('Target')
    })
    act(() => {
      result.current.addNode('Bystander')
    })
    const sourceId = result.current.nodes[0].id
    const targetId = result.current.nodes[1].id
    const secondPaneId = 'pane-nested'

    act(() => {
      result.current.updateLayoutSizes(sourceId, {
        type: 'split',
        direction: 'horizontal',
        sizes: [50, 50],
        children: [
          { type: 'pane', id: 'pane-empty', cwd: '' },
          { type: 'pane', id: secondPaneId, cwd: 'D:/nested' },
        ],
      })
    })
    act(() => {
      result.current.movePaneToNode(secondPaneId, sourceId, targetId)
    })

    expect(result.current.nodes.find(n => n.id === targetId)?.layout).toMatchObject({
      type: 'split',
      children: [expect.any(Object), { type: 'pane', id: secondPaneId, cwd: 'D:/nested' }],
    })
  })
})
