import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import schema from '../schema'
import { api } from '../_generated/api'

const modules = import.meta.glob('../**/*.*s')

describe('terminalPrompts', () => {
  test('list returns empty array when no prompts exist', async () => {
    const t = convexTest(schema, modules)

    const prompts = await t.query(api.terminalPrompts.list)

    expect(prompts).toEqual([])
  })

  test('create stores a trimmed title and normalized content', async () => {
    const t = convexTest(schema, modules)

    const id = await t.mutation(api.terminalPrompts.create, {
      title: '  Daily review  ',
      content: 'First line\r\nSecond line',
    })

    const prompts = await t.query(api.terminalPrompts.list)
    expect(id).toBeTruthy()
    expect(prompts).toHaveLength(1)
    expect(prompts[0].title).toBe('Daily review')
    expect(prompts[0].content).toBe('First line\nSecond line')
    expect(prompts[0].sortOrder).toBe(0)
  })

  test('create rejects blank titles', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(api.terminalPrompts.create, {
        title: '   ',
        content: 'Prompt body',
      })
    ).rejects.toThrow('Title is required')
  })

  test('create rejects blank prompt content', async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(api.terminalPrompts.create, {
        title: 'Daily review',
        content: ' \r\n ',
      })
    ).rejects.toThrow('Prompt content is required')
  })

  test('update changes stored fields', async () => {
    const t = convexTest(schema, modules)

    const id = await t.mutation(api.terminalPrompts.create, {
      title: 'Original',
      content: 'Initial prompt',
    })

    await t.mutation(api.terminalPrompts.update, {
      id,
      title: 'Updated title',
      content: 'Line one\r\nLine two',
    })

    const prompts = await t.query(api.terminalPrompts.list)
    expect(prompts[0].title).toBe('Updated title')
    expect(prompts[0].content).toBe('Line one\nLine two')
  })

  test('markUsed moves a prompt to the top of the list', async () => {
    const t = convexTest(schema, modules)

    const firstId = await t.mutation(api.terminalPrompts.create, {
      title: 'First',
      content: 'first prompt',
    })
    await t.mutation(api.terminalPrompts.create, {
      title: 'Second',
      content: 'second prompt',
    })

    await t.mutation(api.terminalPrompts.markUsed, { id: firstId })

    const prompts = await t.query(api.terminalPrompts.list)
    expect(prompts[0].title).toBe('First')
    expect(prompts[0].lastUsedAt).toBeTypeOf('number')
  })

  test('update throws when prompt does not exist', async () => {
    const t = convexTest(schema, modules)

    const id = await t.mutation(api.terminalPrompts.create, {
      title: 'Temp',
      content: 'temporary',
    })
    await t.mutation(api.terminalPrompts.remove, { id })

    await expect(t.mutation(api.terminalPrompts.update, { id, title: 'Gone' })).rejects.toThrow()
  })

  test('update returns id when no fields are changed', async () => {
    const t = convexTest(schema, modules)

    const id = await t.mutation(api.terminalPrompts.create, {
      title: 'Unchanged',
      content: 'stays the same',
    })

    const result = await t.mutation(api.terminalPrompts.update, { id })
    expect(result).toBe(id)
  })

  test('update sets sortOrder independently', async () => {
    const t = convexTest(schema, modules)

    const id = await t.mutation(api.terminalPrompts.create, {
      title: 'Reorder',
      content: 'reorder me',
    })

    await t.mutation(api.terminalPrompts.update, { id, sortOrder: 99 })

    const prompts = await t.query(api.terminalPrompts.list)
    expect(prompts[0].sortOrder).toBe(99)
  })

  test('markUsed is a no-op for non-existent prompt', async () => {
    const t = convexTest(schema, modules)

    const id = await t.mutation(api.terminalPrompts.create, {
      title: 'Gone',
      content: 'will be deleted',
    })
    await t.mutation(api.terminalPrompts.remove, { id })

    const result = await t.mutation(api.terminalPrompts.markUsed, { id })
    expect(result).toBe(id)
  })

  test('remove is a no-op for non-existent prompt', async () => {
    const t = convexTest(schema, modules)

    const id = await t.mutation(api.terminalPrompts.create, {
      title: 'Already gone',
      content: 'deleted already',
    })
    await t.mutation(api.terminalPrompts.remove, { id })

    const result = await t.mutation(api.terminalPrompts.remove, { id })
    expect(result).toBe(id)
  })

  test('list sorts by sortOrder when lastUsedAt and updatedAt are equal', async () => {
    const t = convexTest(schema, modules)

    await t.mutation(api.terminalPrompts.create, {
      title: 'B-sorted',
      content: 'second by sort',
      sortOrder: 2,
    })
    await t.mutation(api.terminalPrompts.create, {
      title: 'A-sorted',
      content: 'first by sort',
      sortOrder: 1,
    })

    const prompts = await t.query(api.terminalPrompts.list)
    expect(prompts[0].title).toBe('A-sorted')
    expect(prompts[1].title).toBe('B-sorted')
  })

  test('list falls back to title sort when lastUsedAt, sortOrder, and updatedAt are equal', async () => {
    const t = convexTest(schema, modules)

    // Create two prompts and manually set identical timestamps so the comparator
    // falls through to title localeCompare
    await t.run(async ctx => {
      const now = Date.now()
      await ctx.db.insert('terminalPrompts', {
        title: 'Zebra',
        content: 'z content',
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert('terminalPrompts', {
        title: 'Apple',
        content: 'a content',
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      })
    })

    const prompts = await t.query(api.terminalPrompts.list)
    expect(prompts[0].title).toBe('Apple')
    expect(prompts[1].title).toBe('Zebra')
  })

  test('remove deletes an existing prompt', async () => {
    const t = convexTest(schema, modules)

    const id = await t.mutation(api.terminalPrompts.create, {
      title: 'Disposable',
      content: 'delete me',
    })

    await t.mutation(api.terminalPrompts.remove, { id })

    const prompts = await t.query(api.terminalPrompts.list)
    expect(prompts).toEqual([])
  })
})
