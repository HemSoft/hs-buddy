import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { notFoundError } from './lib/domain'

// List all bookmarks
export const list = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query('bookmarks').collect()
  },
})

// List bookmarks by category
export const listByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('bookmarks')
      .withIndex('by_category', q => q.eq('category', args.category))
      .collect()
  },
})

// Get single bookmark by ID
export const get = query({
  args: { id: v.id('bookmarks') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// Get distinct categories
export const listCategories = query({
  args: {},
  handler: async ctx => {
    const all = await ctx.db.query('bookmarks').collect()
    const categories = [...new Set(all.map(b => b.category))]
    categories.sort((a, b) => a.localeCompare(b))
    return categories
  },
})

// Create new bookmark
export const create = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    faviconUrl: v.optional(v.string()),
    category: v.string(),
    tags: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Validate URL
    const parsed = new URL(args.url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http and https URLs are allowed')
    }

    // Validate tag count
    if (args.tags && args.tags.length > 50) {
      throw new Error('Maximum 50 tags allowed')
    }

    // Validate category is non-empty
    if (!args.category.trim()) {
      throw new Error('Category is required')
    }

    // Check for duplicate URL within the same category
    const duplicateInCategory = await ctx.db
      .query('bookmarks')
      .withIndex('by_url_category', q => q.eq('url', args.url).eq('category', args.category))
      .first()

    if (duplicateInCategory) {
      throw new Error(`URL is already bookmarked in this category: ${args.url}`)
    }

    const now = Date.now()

    // Auto-assign sortOrder if not provided
    let sortOrder = args.sortOrder
    if (sortOrder === undefined) {
      const categoryBookmarks = await ctx.db
        .query('bookmarks')
        .withIndex('by_category', q => q.eq('category', args.category))
        .collect()
      sortOrder = categoryBookmarks.length
    }

    return await ctx.db.insert('bookmarks', {
      url: args.url,
      title: args.title,
      description: args.description,
      faviconUrl: args.faviconUrl,
      category: args.category,
      tags: args.tags,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
  },
})

// Update bookmark
export const update = mutation({
  args: {
    id: v.id('bookmarks'),
    url: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    faviconUrl: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id)
    if (!existing) {
      throw notFoundError('Bookmark', args.id)
    }

    // Validate URL if changed
    if (args.url !== undefined) {
      const parsed = new URL(args.url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only http and https URLs are allowed')
      }
    }

    // Validate category is non-empty
    if (args.category !== undefined && !args.category.trim()) {
      throw new Error('Category is required')
    }

    // Validate tag count
    if (args.tags && args.tags.length > 50) {
      throw new Error('Maximum 50 tags allowed')
    }

    // If URL or category changed, check for duplicate in target category
    const targetCategory = args.category ?? existing.category
    const targetUrl = args.url ?? existing.url
    if (args.url !== undefined || args.category !== undefined) {
      const matchingInCategory = await ctx.db
        .query('bookmarks')
        .withIndex('by_url_category', q => q.eq('url', targetUrl).eq('category', targetCategory))
        .take(2)
      const hasDuplicate = matchingInCategory.some(b => b._id !== args.id)
      if (hasDuplicate) {
        throw new Error(`URL is already bookmarked in this category: ${targetUrl}`)
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: Date.now() }
    for (const [key, value] of Object.entries(args)) {
      if (key !== 'id' && value !== undefined) updateData[key] = value
    }

    await ctx.db.patch(args.id, updateData)
    return args.id
  },
})

// Record a visit (updates lastVisitedAt)
export const recordVisit = mutation({
  args: { id: v.id('bookmarks') },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id)
    if (!existing) return
    await ctx.db.patch(args.id, {
      lastVisitedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

// Delete bookmark
export const remove = mutation({
  args: { id: v.id('bookmarks') },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id)
    if (!existing) {
      throw notFoundError('Bookmark', args.id)
    }
    await ctx.db.delete(args.id)
    return args.id
  },
})

// Batch-update sort orders (used for drag-and-drop reordering)
export const reorder = mutation({
  args: {
    updates: v.array(v.object({ id: v.id('bookmarks'), sortOrder: v.number() })),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    for (const { id, sortOrder } of args.updates) {
      await ctx.db.patch(id, { sortOrder, updatedAt: now })
    }
  },
})
