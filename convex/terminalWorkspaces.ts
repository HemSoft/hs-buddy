import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

const nodeValidator = v.object({
  id: v.string(),
  name: v.string(),
  color: v.optional(v.string()),
  parentId: v.optional(v.string()),
  sortOrder: v.number(),
  layout: v.any(),
})

type TerminalWorkspaceNode = {
  id: string
  parentId?: string
}

function shouldRemoveNode(node: TerminalWorkspaceNode, idsToRemove: Set<string>): boolean {
  if (!node.parentId) return false
  return idsToRemove.has(node.parentId) && !idsToRemove.has(node.id)
}

function collectNodeIdsToRemove(nodes: TerminalWorkspaceNode[], rootNodeId: string): Set<string> {
  const idsToRemove = new Set<string>([rootNodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (shouldRemoveNode(node, idsToRemove)) {
        idsToRemove.add(node.id)
        changed = true
      }
    }
  }
  return idsToRemove
}

function resolveActiveNodeAfterRemoval(
  activeNodeId: string | undefined,
  idsToRemove: Set<string>,
  remainingNodes: TerminalWorkspaceNode[]
): string | undefined {
  if (!activeNodeId) return activeNodeId
  if (!idsToRemove.has(activeNodeId)) return activeNodeId
  return remainingNodes[0]?.id
}

/** Get the terminal workspace (singleton). */
export const getWorkspace = query({
  args: {},
  handler: async ctx => {
    return await ctx.db
      .query('terminalWorkspaces')
      .withIndex('by_key', q => q.eq('key', 'default'))
      .unique()
  },
})

/** Save the full workspace (upsert). */
export const saveWorkspace = mutation({
  args: {
    nodes: v.array(nodeValidator),
    activeNodeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('terminalWorkspaces')
      .withIndex('by_key', q => q.eq('key', 'default'))
      .unique()

    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        nodes: args.nodes,
        activeNodeId: args.activeNodeId,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('terminalWorkspaces', {
        key: 'default',
        nodes: args.nodes,
        activeNodeId: args.activeNodeId,
        createdAt: now,
        updatedAt: now,
      })
    }
  },
})

/** Update a single node within the workspace. */
export const updateNode = mutation({
  args: {
    nodeId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      color: v.optional(v.string()),
      parentId: v.optional(v.string()),
      sortOrder: v.optional(v.number()),
      layout: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query('terminalWorkspaces')
      .withIndex('by_key', q => q.eq('key', 'default'))
      .unique()
    if (!workspace) return

    const nodes = workspace.nodes.map(node =>
      node.id === args.nodeId ? { ...node, ...args.patch } : node
    )

    await ctx.db.patch(workspace._id, { nodes, updatedAt: Date.now() })
  },
})

/** Remove a node from the workspace. */
export const removeNode = mutation({
  args: { nodeId: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query('terminalWorkspaces')
      .withIndex('by_key', q => q.eq('key', 'default'))
      .unique()
    if (!workspace) return

    const idsToRemove = collectNodeIdsToRemove(workspace.nodes, args.nodeId)
    const nodes = workspace.nodes.filter(n => !idsToRemove.has(n.id))
    const activeNodeId = resolveActiveNodeAfterRemoval(workspace.activeNodeId, idsToRemove, nodes)

    await ctx.db.patch(workspace._id, { nodes, activeNodeId, updatedAt: Date.now() })
  },
})

/** Set the active node. */
export const setActiveNode = mutation({
  args: { nodeId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query('terminalWorkspaces')
      .withIndex('by_key', q => q.eq('key', 'default'))
      .unique()
    if (!workspace) return

    await ctx.db.patch(workspace._id, { activeNodeId: args.nodeId, updatedAt: Date.now() })
  },
})
