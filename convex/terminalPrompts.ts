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

type SortablePrompt = {
  lastUsedAt?: number
  updatedAt: number
  title: string
  sortOrder?: number
}

function getLastUsed(p: SortablePrompt): number {
  return p.lastUsedAt ?? 0
}

function getSortOrder(p: SortablePrompt): number {
  return p.sortOrder ?? Number.MAX_SAFE_INTEGER
}

function comparePrompts(a: SortablePrompt, b: SortablePrompt) {
  const lastUsedDiff = getLastUsed(b) - getLastUsed(a)
  if (lastUsedDiff !== 0) return lastUsedDiff

  const sortOrderDiff = getSortOrder(a) - getSortOrder(b)
  if (sortOrderDiff !== 0) return sortOrderDiff

  const updatedAtDiff = b.updatedAt - a.updatedAt
  if (updatedAtDiff !== 0) return updatedAtDiff

  return a.title.localeCompare(b.title)
}

function applyPromptTitlePatch(
  patch: { title?: string; content?: string; sortOrder?: number; updatedAt?: number },
  title: string | undefined
): void {
  if (title !== undefined) {
    patch.title = title.trim()
  }
}

function applyPromptContentPatch(
  patch: { title?: string; content?: string; sortOrder?: number; updatedAt?: number },
  content: string | undefined
): void {
  if (content !== undefined) {
    patch.content = normalizeContent(content)
  }
}

function applyPromptSortOrderPatch(
  patch: { title?: string; content?: string; sortOrder?: number; updatedAt?: number },
  sortOrder: number | undefined
): void {
  if (sortOrder !== undefined) {
    patch.sortOrder = sortOrder
  }
}

function buildPromptPatch(args: { title?: string; content?: string; sortOrder?: number }) {
  const patch: {
    title?: string
    content?: string
    sortOrder?: number
    updatedAt?: number
  } = {}
  applyPromptTitlePatch(patch, args.title)
  applyPromptContentPatch(patch, args.content)
  applyPromptSortOrderPatch(patch, args.sortOrder)
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
