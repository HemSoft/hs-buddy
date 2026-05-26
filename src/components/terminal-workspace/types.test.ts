import { describe, expect, it, vi } from 'vitest'
import { collectPaneIds, createTreeNode, removePane, splitPane, updatePaneCwd } from './types'
import type { TerminalLayout } from './types'

describe('terminal workspace layout types', () => {
  it('creates nodes with defaults and options', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    vi.spyOn(Date, 'now').mockReturnValue(123)

    const node = createTreeNode('Dev', { color: '#4ec9b0', parentId: 'root', cwd: 'D:/repo' })

    expect(node).toEqual({
      id: 'terminal-node-00000000-0000-4000-8000-000000000001',
      name: 'Dev',
      color: '#4ec9b0',
      parentId: 'root',
      sortOrder: 123,
      layout: { type: 'pane', id: 'pane-00000000-0000-4000-8000-000000000002', cwd: 'D:/repo' },
    })
  })

  it('collects pane ids and updates matching pane cwd in nested layouts', () => {
    const layout: TerminalLayout = {
      type: 'split',
      direction: 'horizontal',
      sizes: [60, 40],
      children: [
        { type: 'pane', id: 'a', cwd: '' },
        {
          type: 'split',
          direction: 'vertical',
          sizes: [50, 50],
          children: [
            { type: 'pane', id: 'b', cwd: '' },
            { type: 'pane', id: 'c', cwd: '' },
          ],
        },
      ],
    }

    expect(collectPaneIds(layout)).toEqual(['a', 'b', 'c'])
    expect(updatePaneCwd(layout, 'b', 'D:/work')).toMatchObject({
      children: [{ cwd: '' }, { children: [{ cwd: 'D:/work' }, { cwd: '' }] }],
    })
  })

  it('splits matching panes and leaves non-matches unchanged', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000003')
    const layout: TerminalLayout = { type: 'pane', id: 'a', cwd: 'D:/repo' }

    expect(splitPane(layout, 'missing', 'horizontal')).toBe(layout)
    expect(splitPane(layout, 'a', 'vertical')).toEqual({
      type: 'split',
      direction: 'vertical',
      children: [
        layout,
        { type: 'pane', id: 'pane-00000000-0000-4000-8000-000000000003', cwd: 'D:/repo' },
      ],
      sizes: [50, 50],
    })
  })

  it('splits nested panes and returns the original split when no child changes', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000004')
    const layout: TerminalLayout = {
      type: 'split',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { type: 'pane', id: 'a', cwd: '' },
        { type: 'pane', id: 'b', cwd: 'D:/b' },
      ],
    }

    expect(splitPane(layout, 'missing', 'vertical')).toBe(layout)
    expect(splitPane(layout, 'b', 'vertical')).toMatchObject({
      type: 'split',
      children: [
        { type: 'pane', id: 'a' },
        {
          type: 'split',
          direction: 'vertical',
          children: [
            { type: 'pane', id: 'b', cwd: 'D:/b' },
            { type: 'pane', id: 'pane-00000000-0000-4000-8000-000000000004', cwd: 'D:/b' },
          ],
        },
      ],
    })
  })

  it('removes panes and collapses splits', () => {
    const layout: TerminalLayout = {
      type: 'split',
      direction: 'horizontal',
      sizes: [70, 30],
      children: [
        { type: 'pane', id: 'a', cwd: '' },
        { type: 'pane', id: 'b', cwd: '' },
      ],
    }

    expect(removePane({ type: 'pane', id: 'a', cwd: '' }, 'a')).toBeNull()
    expect(removePane(layout, 'missing')).toEqual(layout)
    expect(removePane(layout, 'b')).toEqual({ type: 'pane', id: 'a', cwd: '' })
  })

  it('removes one pane from a larger split while preserving size fallbacks', () => {
    const layout: TerminalLayout = {
      type: 'split',
      direction: 'vertical',
      sizes: [20],
      children: [
        { type: 'pane', id: 'a', cwd: '' },
        { type: 'pane', id: 'b', cwd: '' },
        { type: 'pane', id: 'c', cwd: '' },
      ],
    }

    expect(removePane(layout, 'b')).toEqual({
      type: 'split',
      direction: 'vertical',
      children: [
        { type: 'pane', id: 'a', cwd: '' },
        { type: 'pane', id: 'c', cwd: '' },
      ],
      sizes: [20, 50],
    })
  })

  it('returns null when every child pane is removed from a split', () => {
    const layout: TerminalLayout = {
      type: 'split',
      direction: 'vertical',
      sizes: [100],
      children: [{ type: 'pane', id: 'a', cwd: '' }],
    }

    expect(removePane(layout, 'a')).toBeNull()
  })
})
