import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

const paneLayout = { type: 'pane', terminalId: 'terminal-1' }

function workspaceNodes() {
  return [
    { id: 'root', name: 'Root', sortOrder: 0, layout: paneLayout },
    {
      id: 'child',
      name: 'Child',
      color: '#00ff00',
      parentId: 'root',
      sortOrder: 1,
      layout: { type: 'pane', terminalId: 'terminal-2' },
    },
    {
      id: 'grandchild',
      name: 'Grandchild',
      parentId: 'child',
      sortOrder: 2,
      layout: { type: 'pane', terminalId: 'terminal-3' },
    },
    {
      id: 'sibling',
      name: 'Sibling',
      parentId: 'root',
      sortOrder: 3,
      layout: { type: 'pane', terminalId: 'terminal-4' },
    },
  ]
}

describe('terminalWorkspaces', () => {
  test('getWorkspace returns null before a workspace is saved', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.terminalWorkspaces.getWorkspace)).resolves.toBeNull()
  })

  test('saveWorkspace creates and replaces the singleton workspace', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.terminalWorkspaces.saveWorkspace, {
      nodes: workspaceNodes(),
      activeNodeId: 'child',
    })

    const created = await t.query(api.terminalWorkspaces.getWorkspace)
    expect(created?.key).toBe('default')
    expect(created?.nodes).toHaveLength(4)
    expect(created?.activeNodeId).toBe('child')

    await t.mutation(api.terminalWorkspaces.saveWorkspace, {
      nodes: [{ id: 'solo', name: 'Solo', sortOrder: 0, layout: paneLayout }],
      activeNodeId: 'solo',
    })

    const updated = await t.query(api.terminalWorkspaces.getWorkspace)
    expect(updated?.nodes).toEqual([{ id: 'solo', name: 'Solo', sortOrder: 0, layout: paneLayout }])
    expect(updated?.activeNodeId).toBe('solo')
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(created?.updatedAt ?? 0)
  })

  test('updateNode patches one node and leaves missing workspaces unchanged', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.terminalWorkspaces.updateNode, {
      nodeId: 'missing',
      patch: { name: 'Ignored' },
    })

    await t.mutation(api.terminalWorkspaces.saveWorkspace, {
      nodes: workspaceNodes(),
      activeNodeId: 'root',
    })
    await t.mutation(api.terminalWorkspaces.updateNode, {
      nodeId: 'child',
      patch: {
        name: 'Renamed child',
        color: '#ff00ff',
        parentId: 'sibling',
        sortOrder: 9,
        layout: { type: 'pane', terminalId: 'updated' },
      },
    })

    const workspace = await t.query(api.terminalWorkspaces.getWorkspace)
    const child = workspace?.nodes.find(node => node.id === 'child')
    expect(child).toMatchObject({
      name: 'Renamed child',
      color: '#ff00ff',
      parentId: 'sibling',
      sortOrder: 9,
      layout: { type: 'pane', terminalId: 'updated' },
    })
    expect(workspace?.nodes.find(node => node.id === 'root')?.name).toBe('Root')
  })

  test('removeNode removes descendants and moves active node to the first remaining node', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.terminalWorkspaces.saveWorkspace, {
      nodes: workspaceNodes(),
      activeNodeId: 'grandchild',
    })

    await t.mutation(api.terminalWorkspaces.removeNode, { nodeId: 'child' })

    const workspace = await t.query(api.terminalWorkspaces.getWorkspace)
    expect(workspace?.nodes.map(node => node.id)).toEqual(['root', 'sibling'])
    expect(workspace?.activeNodeId).toBe('root')
  })

  test('removeNode preserves an active node outside the removed subtree', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.terminalWorkspaces.removeNode, { nodeId: 'missing' })

    await t.mutation(api.terminalWorkspaces.saveWorkspace, {
      nodes: workspaceNodes(),
      activeNodeId: 'sibling',
    })
    await t.mutation(api.terminalWorkspaces.removeNode, { nodeId: 'child' })

    const workspace = await t.query(api.terminalWorkspaces.getWorkspace)
    expect(workspace?.nodes.map(node => node.id)).toEqual(['root', 'sibling'])
    expect(workspace?.activeNodeId).toBe('sibling')
  })

  test('removeNode clears active node when every node is removed', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.terminalWorkspaces.saveWorkspace, {
      nodes: [{ id: 'root', name: 'Root', sortOrder: 0, layout: paneLayout }],
      activeNodeId: 'root',
    })

    await t.mutation(api.terminalWorkspaces.removeNode, { nodeId: 'root' })

    const workspace = await t.query(api.terminalWorkspaces.getWorkspace)
    expect(workspace?.nodes).toEqual([])
    expect(workspace?.activeNodeId).toBeUndefined()
  })

  test('setActiveNode updates and clears the active node', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.terminalWorkspaces.setActiveNode, { nodeId: 'ignored' })

    await t.mutation(api.terminalWorkspaces.saveWorkspace, {
      nodes: workspaceNodes(),
      activeNodeId: undefined,
    })
    await t.mutation(api.terminalWorkspaces.setActiveNode, { nodeId: 'child' })
    expect((await t.query(api.terminalWorkspaces.getWorkspace))?.activeNodeId).toBe('child')

    await t.mutation(api.terminalWorkspaces.setActiveNode, { nodeId: undefined })
    expect((await t.query(api.terminalWorkspaces.getWorkspace))?.activeNodeId).toBeUndefined()
  })
})
