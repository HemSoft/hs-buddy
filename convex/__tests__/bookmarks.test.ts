import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

describe('bookmarks', () => {
  test('list returns empty array when no bookmarks exist', async () => {
    const t = convexTest(schema, modules)
    const bookmarks = await t.query(api.bookmarks.list)
    expect(bookmarks).toEqual([])
  })

  test('create inserts a bookmark and returns its id', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.bookmarks.create, {
      url: 'https://example.com',
      title: 'Example',
      category: 'general',
    })
    expect(id).toBeTruthy()

    const bookmarks = await t.query(api.bookmarks.list)
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0].url).toBe('https://example.com')
    expect(bookmarks[0].title).toBe('Example')
    expect(bookmarks[0].category).toBe('general')
  })

  test('create stores optional fields when provided', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.bookmarks.create, {
      url: 'https://tagged.com',
      title: 'Tagged',
      category: 'work',
      description: 'A work bookmark',
      faviconUrl: 'https://tagged.com/favicon.ico',
      tags: ['work', 'important'],
      sortOrder: 5,
    })

    const bookmarks = await t.query(api.bookmarks.list)
    const bm = bookmarks[0]
    expect(bm.description).toBe('A work bookmark')
    expect(bm.tags).toEqual(['work', 'important'])
    expect(bm.sortOrder).toBe(5)
  })

  test('create auto-assigns sortOrder based on category count', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.bookmarks.create, {
      url: 'https://first.com',
      title: 'First',
      category: 'dev',
    })
    await t.mutation(api.bookmarks.create, {
      url: 'https://second.com',
      title: 'Second',
      category: 'dev',
    })

    const bookmarks = await t.query(api.bookmarks.listByCategory, { category: 'dev' })
    const orders = bookmarks.map(b => b.sortOrder).sort((a, b) => a - b)
    expect(orders).toEqual([0, 1])
  })

  test('create throws on duplicate URL within same category', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.bookmarks.create, {
      url: 'https://dup.com',
      title: 'Original',
      category: 'dev',
    })

    await expect(
      t.mutation(api.bookmarks.create, {
        url: 'https://dup.com',
        title: 'Duplicate',
        category: 'dev',
      })
    ).rejects.toThrow('URL is already bookmarked in this category')
  })

  test('create allows same URL in different categories', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.bookmarks.create, {
      url: 'https://shared.com',
      title: 'Shared Work',
      category: 'work',
    })
    await t.mutation(api.bookmarks.create, {
      url: 'https://shared.com',
      title: 'Shared Personal',
      category: 'personal',
    })

    const all = await t.query(api.bookmarks.list)
    expect(all).toHaveLength(2)
  })

  test('get returns a bookmark by ID', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.bookmarks.create, {
      url: 'https://getme.com',
      title: 'Get Me',
      category: 'test',
    })

    const bm = await t.query(api.bookmarks.get, { id })
    expect(bm?.title).toBe('Get Me')
  })

  test('listByCategory returns only bookmarks in that category', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.bookmarks.create, { url: 'https://a.com', title: 'A', category: 'cat1' })
    await t.mutation(api.bookmarks.create, { url: 'https://b.com', title: 'B', category: 'cat2' })

    const cat1 = await t.query(api.bookmarks.listByCategory, { category: 'cat1' })
    expect(cat1).toHaveLength(1)
    expect(cat1[0].title).toBe('A')
  })

  test('listCategories returns sorted unique categories', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.bookmarks.create, { url: 'https://z.com', title: 'Z', category: 'zzz' })
    await t.mutation(api.bookmarks.create, { url: 'https://a.com', title: 'A', category: 'aaa' })
    await t.mutation(api.bookmarks.create, { url: 'https://b.com', title: 'B', category: 'aaa' })

    const cats = await t.query(api.bookmarks.listCategories)
    expect(cats).toEqual(['aaa', 'zzz'])
  })

  test('update modifies specified fields', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.bookmarks.create, {
      url: 'https://upd.com',
      title: 'Old Title',
      category: 'cat',
    })

    await t.mutation(api.bookmarks.update, { id, title: 'New Title' })

    const bm = await t.query(api.bookmarks.get, { id })
    expect(bm?.title).toBe('New Title')
    expect(bm?.url).toBe('https://upd.com')
  })

  test('update throws when bookmark does not exist', async () => {
    const t = convexTest(schema, modules)
    // Create and remove a bookmark to get a valid but non-existent ID
    const id = await t.mutation(api.bookmarks.create, {
      url: 'https://del.com',
      title: 'Del',
      category: 'x',
    })
    await t.mutation(api.bookmarks.remove, { id })

    await expect(t.mutation(api.bookmarks.update, { id, title: 'No bookmark' })).rejects.toThrow()
  })

  test('recordVisit updates lastVisitedAt', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.bookmarks.create, {
      url: 'https://visit.com',
      title: 'Visit Me',
      category: 'test',
    })

    await t.mutation(api.bookmarks.recordVisit, { id })

    const bm = await t.query(api.bookmarks.get, { id })
    expect(bm?.lastVisitedAt).toBeGreaterThan(0)
  })

  test('recordVisit is a no-op for non-existent bookmark', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.bookmarks.create, {
      url: 'https://gone.com',
      title: 'Gone',
      category: 'x',
    })
    await t.mutation(api.bookmarks.remove, { id })

    // Should not throw
    await t.mutation(api.bookmarks.recordVisit, { id })
  })

  test('remove deletes a bookmark', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.bookmarks.create, {
      url: 'https://rm.com',
      title: 'Remove Me',
      category: 'x',
    })

    await t.mutation(api.bookmarks.remove, { id })

    const bm = await t.query(api.bookmarks.get, { id })
    expect(bm).toBeNull()
  })

  test('remove throws when bookmark does not exist', async () => {
    const t = convexTest(schema, modules)
    const id = await t.mutation(api.bookmarks.create, {
      url: 'https://gone2.com',
      title: 'Gone',
      category: 'x',
    })
    await t.mutation(api.bookmarks.remove, { id })

    await expect(t.mutation(api.bookmarks.remove, { id })).rejects.toThrow()
  })

  test('reorder updates sort orders for multiple bookmarks', async () => {
    const t = convexTest(schema, modules)
    const id1 = await t.mutation(api.bookmarks.create, {
      url: 'https://r1.com',
      title: 'R1',
      category: 'c',
      sortOrder: 0,
    })
    const id2 = await t.mutation(api.bookmarks.create, {
      url: 'https://r2.com',
      title: 'R2',
      category: 'c',
      sortOrder: 1,
    })

    await t.mutation(api.bookmarks.reorder, {
      updates: [
        { id: id1, sortOrder: 10 },
        { id: id2, sortOrder: 5 },
      ],
    })

    const bm1 = await t.query(api.bookmarks.get, { id: id1 })
    const bm2 = await t.query(api.bookmarks.get, { id: id2 })
    expect(bm1?.sortOrder).toBe(10)
    expect(bm2?.sortOrder).toBe(5)
  })
})
