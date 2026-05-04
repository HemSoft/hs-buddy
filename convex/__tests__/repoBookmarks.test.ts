import { convexTest } from 'convex-test'
import { describe, test, expect } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

describe('repoBookmarks', () => {
  test('list returns empty array when no bookmarks exist', async () => {
    const t = convexTest(schema, modules)
    const bookmarks = await t.query(api.repoBookmarks.list)
    expect(bookmarks).toEqual([])
  })

  test('create inserts a new repo bookmark', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.repoBookmarks.create, {
      folder: 'Work',
      owner: 'acme',
      repo: 'backend',
      url: 'https://github.com/acme/backend',
    })

    expect(result._id).toBeTruthy()
    expect(result.inserted).toBe(true)

    const all = await t.query(api.repoBookmarks.list)
    expect(all).toHaveLength(1)
    expect(all[0].owner).toBe('acme')
    expect(all[0].repo).toBe('backend')
  })

  test('create is idempotent — returns existing if already bookmarked', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.repoBookmarks.create, {
      folder: 'Work',
      owner: 'acme',
      repo: 'frontend',
      url: 'https://github.com/acme/frontend',
    })

    const second = await t.mutation(api.repoBookmarks.create, {
      folder: 'Personal',
      owner: 'acme',
      repo: 'frontend',
      url: 'https://github.com/acme/frontend',
    })

    expect(second.inserted).toBe(false)

    const all = await t.query(api.repoBookmarks.list)
    expect(all).toHaveLength(1)
  })

  test('create stores optional description', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.repoBookmarks.create, {
      folder: 'OSS',
      owner: 'oss',
      repo: 'lib',
      url: 'https://github.com/oss/lib',
      description: 'A great library',
    })

    const all = await t.query(api.repoBookmarks.list)
    expect(all[0].description).toBe('A great library')
  })

  test('listByFolder returns only bookmarks in that folder', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.repoBookmarks.create, {
      folder: 'Work',
      owner: 'acme',
      repo: 'a',
      url: 'https://github.com/acme/a',
    })
    await t.mutation(api.repoBookmarks.create, {
      folder: 'Home',
      owner: 'personal',
      repo: 'b',
      url: 'https://github.com/personal/b',
    })

    const work = await t.query(api.repoBookmarks.listByFolder, { folder: 'Work' })
    expect(work).toHaveLength(1)
    expect(work[0].owner).toBe('acme')
  })

  test('get returns bookmark by ID', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.repoBookmarks.create, {
      folder: 'Test',
      owner: 'test',
      repo: 'repo',
      url: 'https://github.com/test/repo',
    })

    const bm = await t.query(api.repoBookmarks.get, { id: result._id })
    expect(bm?.repo).toBe('repo')
  })

  test('update changes folder and description', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.repoBookmarks.create, {
      folder: 'OldFolder',
      owner: 'x',
      repo: 'y',
      url: 'https://github.com/x/y',
    })

    await t.mutation(api.repoBookmarks.update, {
      id: result._id,
      folder: 'NewFolder',
      description: 'Updated',
    })

    const bm = await t.query(api.repoBookmarks.get, { id: result._id })
    expect(bm?.folder).toBe('NewFolder')
    expect(bm?.description).toBe('Updated')
  })

  test('update throws when bookmark does not exist', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.repoBookmarks.create, {
      folder: 'F',
      owner: 'o',
      repo: 'r',
      url: 'https://github.com/o/r',
    })
    await t.mutation(api.repoBookmarks.remove, { id: result._id })

    await expect(
      t.mutation(api.repoBookmarks.update, { id: result._id, folder: 'New' })
    ).rejects.toThrow()
  })

  test('remove deletes a bookmark', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.repoBookmarks.create, {
      folder: 'Del',
      owner: 'del',
      repo: 'this',
      url: 'https://github.com/del/this',
    })

    await t.mutation(api.repoBookmarks.remove, { id: result._id })

    const all = await t.query(api.repoBookmarks.list)
    expect(all).toHaveLength(0)
  })

  test('remove is idempotent for already-deleted bookmark', async () => {
    const t = convexTest(schema, modules)
    const result = await t.mutation(api.repoBookmarks.create, {
      folder: 'Del2',
      owner: 'del2',
      repo: 'that',
      url: 'https://github.com/del2/that',
    })

    await t.mutation(api.repoBookmarks.remove, { id: result._id })
    // Should not throw
    await t.mutation(api.repoBookmarks.remove, { id: result._id })
  })
})
