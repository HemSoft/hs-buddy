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
