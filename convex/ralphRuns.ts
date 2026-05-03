import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

/**
 * Ralph Loops run CRUD — mirrors the runs table pattern.
 */

const statusValidator = v.union(
  v.literal('pending'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('cancelled'),
  v.literal('orphaned')
)

const scriptTypeValidator = v.union(
  v.literal('ralph'),
  v.literal('ralph-pr'),
  v.literal('ralph-issues'),
  v.literal('template')
)

// ── Queries ─────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query('ralphRuns').withIndex('by_started').order('desc').take(100)
  },
})

export const get = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('ralphRuns')
      .withIndex('by_run_id', q => q.eq('runId', args.runId))
      .first()
  },
})

export const listByRepo = query({
  args: { repoPath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('ralphRuns')
      .withIndex('by_repo', q => q.eq('repoPath', args.repoPath))
      .order('desc')
      .take(50)
  },
})

export const listByStatus = query({
  args: { status: statusValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('ralphRuns')
      .withIndex('by_status', q => q.eq('status', args.status))
      .collect()
  },
})

// ── Mutations ───────────────────────────────────────────────────

export const create = mutation({
  args: {
    runId: v.string(),
    repoPath: v.string(),
    repoSlug: v.optional(v.string()),
    branch: v.optional(v.string()),
    scriptType: scriptTypeValidator,
    templateScript: v.optional(v.string()),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    agents: v.optional(v.array(v.string())),
    status: statusValidator,
    iterations: v.optional(v.number()),
    costMultiplier: v.optional(v.number()),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert('ralphRuns', {
      ...args,
      phase: 'initializing',
      completedIterations: 0,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const updateStatus = mutation({
  args: {
    runId: v.string(),
    status: statusValidator,
    phase: v.optional(v.string()),
    completedIterations: v.optional(v.number()),
    exitCode: v.optional(v.number()),
    error: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('ralphRuns')
      .withIndex('by_run_id', q => q.eq('runId', args.runId))
      .first()

    if (!existing) {
      throw new Error(`Ralph run not found: ${args.runId}`)
    }

    const { runId: _rid, ...updates } = args
    void _rid // satisfy no-unused-vars
    await ctx.db.patch(existing._id, {
      ...updates,
      updatedAt: Date.now(),
    })

    return existing._id
  },
})
