import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { notFoundError } from './lib/domain'

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

function validatePromptFields(fields: { title?: string; content?: string }) {
  if (fields.title !== undefined && !fields.title.trim()) {
    throw new Error('Title is required')
  }

  if (fields.content !== undefined && !normalizeContent(fields.content).trim()) {
    throw new Error('Prompt content is required')
  }
}

type PromptSortable = {
  lastUsedAt?: number
  updatedAt: number
  title: string
  sortOrder?: number
}

function compareByLastUsed(a: PromptSortable, b: PromptSortable): number {
  return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
}

function compareBySortOrder(a: PromptSortable, b: PromptSortable): number {
  return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
}

function comparePrompts(a: PromptSortable, b: PromptSortable) {
  const lastUsedDiff = compareByLastUsed(a, b)
  if (lastUsedDiff !== 0) return lastUsedDiff

  const sortOrderDiff = compareBySortOrder(a, b)
  if (sortOrderDiff !== 0) return sortOrderDiff

  const updatedAtDiff = b.updatedAt - a.updatedAt
  if (updatedAtDiff !== 0) return updatedAtDiff

  return a.title.localeCompare(b.title)
}

function buildPromptPatch(args: { title?: string; content?: string; sortOrder?: number }): {
  title?: string
  content?: string
  sortOrder?: number
  updatedAt?: number
} {
  const patch: {
    title?: string
    content?: string
    sortOrder?: number
  } = {}

  if (args.title !== undefined) patch.title = args.title.trim()
  if (args.content !== undefined) patch.content = normalizeContent(args.content)
  if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder

  return patch
}

export const list = query({
  args: {},
  handler: async ctx => {
    const prompts = await ctx.db.query('terminalPrompts').collect()
    return prompts.sort(comparePrompts)
  },
})

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validatePromptFields(args)

    const now = Date.now()
    const allPrompts = await ctx.db.query('terminalPrompts').collect()
    const sortOrder = args.sortOrder ?? allPrompts.length

    return await ctx.db.insert('terminalPrompts', {
      title: args.title.trim(),
      content: normalizeContent(args.content),
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id('terminalPrompts'),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id)
    if (!existing) {
      throw notFoundError('Terminal prompt', args.id)
    }

    validatePromptFields(args)

    const patch = buildPromptPatch(args)

    if (Object.keys(patch).length === 0) {
      return args.id
    }

    patch.updatedAt = Date.now()
    await ctx.db.patch(args.id, patch)
    return args.id
  },
})

export const markUsed = mutation({
  args: { id: v.id('terminalPrompts') },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id)
    if (!existing) {
      return args.id
    }

    const now = Date.now()
    await ctx.db.patch(args.id, {
      lastUsedAt: now,
      updatedAt: now,
    })
    return args.id
  },
})

export const remove = mutation({
  args: { id: v.id('terminalPrompts') },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id)
    if (!existing) {
      return args.id
    }

    await ctx.db.delete(args.id)
    return args.id
  },
})
