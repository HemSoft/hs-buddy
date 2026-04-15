import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBookmarkListState, type Bookmark } from './useBookmarkListState'
import type { Id } from '../../convex/_generated/dataModel'

const {
  mockUseBookmarks,
  mockUseBookmarkCategories,
  mockUseBookmarkMutations,
  mockRemove,
  mockRecordVisit,
} = vi.hoisted(() => ({
  mockUseBookmarks: vi.fn(),
  mockUseBookmarkCategories: vi.fn(),
  mockUseBookmarkMutations: vi.fn(),
  mockRemove: vi.fn(),
  mockRecordVisit: vi.fn(),
}))

vi.mock('./useConvex', () => ({
  useBookmarks: mockUseBookmarks,
  useBookmarkCategories: mockUseBookmarkCategories,
  useBookmarkMutations: mockUseBookmarkMutations,
}))

const makeBookmark = (overrides: Partial<Bookmark> = {}): Bookmark => ({
  _id: 'bk_1' as Id<'bookmarks'>,
  url: 'https://example.com',
  title: 'Example',
  category: 'Dev Tools',
  sortOrder: 0,
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
})

const defaultBookmarks: Bookmark[] = [
  makeBookmark({
    _id: 'bk_1' as Id<'bookmarks'>,
    title: 'GitHub',
    url: 'https://github.com',
    category: 'Dev Tools',
    tags: ['git', 'code'],
    sortOrder: 1,
    createdAt: 1000,
  }),
  makeBookmark({
    _id: 'bk_2' as Id<'bookmarks'>,
    title: 'MDN',
    url: 'https://developer.mozilla.org',
    category: 'Documentation',
    tags: ['docs'],
    sortOrder: 2,
    createdAt: 2000,
  }),
  makeBookmark({
    _id: 'bk_3' as Id<'bookmarks'>,
    title: 'React',
    url: 'https://react.dev',
    category: 'Dev Tools/Frontend',
    description: 'React documentation and guides',
    sortOrder: 3,
    createdAt: 3000,
  }),
]

describe('useBookmarkListState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseBookmarks.mockReturnValue(defaultBookmarks)
    mockUseBookmarkCategories.mockReturnValue(['Dev Tools', 'Documentation'])
    mockRemove.mockResolvedValue(undefined)
    mockRecordVisit.mockResolvedValue(undefined)
    mockUseBookmarkMutations.mockReturnValue({
      remove: mockRemove,
      recordVisit: mockRecordVisit,
    })
  })

  it('returns initial state', () => {
    const { result } = renderHook(() => useBookmarkListState())
    expect(result.current.state.searchQuery).toBe('')
    expect(result.current.state.selectedCategory).toBe('')
    expect(result.current.state.selectedTag).toBe('')
    expect(result.current.state.dialogOpen).toBe(false)
    expect(result.current.state.editingBookmark).toBeNull()
    expect(result.current.state.deleteTarget).toBeNull()
    expect(result.current.state.dragOver).toBe(false)
    expect(result.current.hasFilters).toBe(false)
  })

  it('uses filterCategory prop as initial selectedCategory', () => {
    const { result } = renderHook(() => useBookmarkListState('Dev Tools'))
    expect(result.current.state.selectedCategory).toBe('Dev Tools')
    expect(result.current.hasFilters).toBe(true)
  })

  describe('reducer actions', () => {
    it('set-search updates searchQuery', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-search', query: 'react' }))
      expect(result.current.state.searchQuery).toBe('react')
      expect(result.current.hasFilters).toBe(true)
    })

    it('set-category updates selectedCategory', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-category', category: 'Dev Tools' }))
      expect(result.current.state.selectedCategory).toBe('Dev Tools')
    })

    it('set-tag updates selectedTag', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-tag', tag: 'git' }))
      expect(result.current.state.selectedTag).toBe('git')
    })

    it('clear-filters resets all filter state', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => {
        result.current.dispatch({ type: 'set-search', query: 'test' })
        result.current.dispatch({ type: 'set-category', category: 'Docs' })
        result.current.dispatch({ type: 'set-tag', tag: 'git' })
      })
      act(() => result.current.dispatch({ type: 'clear-filters' }))
      expect(result.current.state.searchQuery).toBe('')
      expect(result.current.state.selectedCategory).toBe('')
      expect(result.current.state.selectedTag).toBe('')
    })

    it('open-add opens dialog for new bookmark', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'open-add' }))
      expect(result.current.state.dialogOpen).toBe(true)
      expect(result.current.state.editingBookmark).toBeNull()
      expect(result.current.state.droppedUrl).toBeNull()
    })

    it('open-edit opens dialog with bookmark to edit', () => {
      const bk = defaultBookmarks[0]
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'open-edit', bookmark: bk }))
      expect(result.current.state.dialogOpen).toBe(true)
      expect(result.current.state.editingBookmark).toBe(bk)
    })

    it('open-drop opens dialog with dropped URL', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() =>
        result.current.dispatch({ type: 'open-drop', url: 'https://dropped.com', title: 'Drop' })
      )
      expect(result.current.state.dialogOpen).toBe(true)
      expect(result.current.state.droppedUrl).toBe('https://dropped.com')
      expect(result.current.state.droppedTitle).toBe('Drop')
      expect(result.current.state.editingBookmark).toBeNull()
    })

    it('open-drop with null title', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() =>
        result.current.dispatch({
          type: 'open-drop',
          url: 'https://a.com',
          title: null as unknown as string,
        })
      )
      expect(result.current.state.droppedTitle).toBeNull()
    })

    it('close-dialog resets dialog state', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'open-add' }))
      act(() => result.current.dispatch({ type: 'close-dialog' }))
      expect(result.current.state.dialogOpen).toBe(false)
      expect(result.current.state.editingBookmark).toBeNull()
      expect(result.current.state.droppedUrl).toBeNull()
    })

    it('set-delete-target sets target and clear-delete clears it', () => {
      const bk = defaultBookmarks[0]
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-delete-target', bookmark: bk }))
      expect(result.current.state.deleteTarget).toBe(bk)
      act(() => result.current.dispatch({ type: 'clear-delete' }))
      expect(result.current.state.deleteTarget).toBeNull()
      expect(result.current.state.deleteError).toBeNull()
    })

    it('set-delete-error stores error message', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-delete-error', error: 'oops' }))
      expect(result.current.state.deleteError).toBe('oops')
    })

    it('set-drag-over toggles drag state', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-drag-over', active: true }))
      expect(result.current.state.dragOver).toBe(true)
      act(() => result.current.dispatch({ type: 'set-drag-over', active: false }))
      expect(result.current.state.dragOver).toBe(false)
    })
  })

  describe('allTags', () => {
    it('returns empty array when bookmarks are undefined', () => {
      mockUseBookmarks.mockReturnValue(undefined)
      const { result } = renderHook(() => useBookmarkListState())
      expect(result.current.allTags).toEqual([])
    })

    it('collects and sorts unique tags', () => {
      const { result } = renderHook(() => useBookmarkListState())
      expect(result.current.allTags).toEqual(['code', 'docs', 'git'])
    })

    it('handles bookmarks without tags', () => {
      mockUseBookmarks.mockReturnValue([
        makeBookmark({ tags: undefined }),
        makeBookmark({ _id: 'bk_x' as Id<'bookmarks'>, tags: ['alpha'] }),
      ])
      const { result } = renderHook(() => useBookmarkListState())
      expect(result.current.allTags).toEqual(['alpha'])
    })
  })

  describe('filteredBookmarks', () => {
    it('returns empty when allBookmarks is undefined', () => {
      mockUseBookmarks.mockReturnValue(undefined)
      const { result } = renderHook(() => useBookmarkListState())
      expect(result.current.filteredBookmarks).toEqual([])
    })

    it('returns all bookmarks when no filters active', () => {
      const { result } = renderHook(() => useBookmarkListState())
      expect(result.current.filteredBookmarks).toHaveLength(3)
    })

    it('filters by exact category match', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-category', category: 'Documentation' }))
      expect(result.current.filteredBookmarks).toHaveLength(1)
      expect(result.current.filteredBookmarks[0].title).toBe('MDN')
    })

    it('filters by category prefix (subcategories)', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-category', category: 'Dev Tools' }))
      // Should match "Dev Tools" and "Dev Tools/Frontend"
      expect(result.current.filteredBookmarks).toHaveLength(2)
    })

    it('filters by tag', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-tag', tag: 'git' }))
      expect(result.current.filteredBookmarks).toHaveLength(1)
      expect(result.current.filteredBookmarks[0].title).toBe('GitHub')
    })

    it('filters by search query matching title', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-search', query: 'github' }))
      expect(result.current.filteredBookmarks).toHaveLength(1)
      expect(result.current.filteredBookmarks[0].title).toBe('GitHub')
    })

    it('filters by search query matching URL', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-search', query: 'mozilla' }))
      expect(result.current.filteredBookmarks).toHaveLength(1)
      expect(result.current.filteredBookmarks[0].title).toBe('MDN')
    })

    it('filters by search query matching description', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-search', query: 'guides' }))
      expect(result.current.filteredBookmarks).toHaveLength(1)
      expect(result.current.filteredBookmarks[0].title).toBe('React')
    })

    it('filters by search query matching tags', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-search', query: 'docs' }))
      expect(result.current.filteredBookmarks).toHaveLength(1)
      expect(result.current.filteredBookmarks[0].title).toBe('MDN')
    })

    it('combines category and search filters', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => {
        result.current.dispatch({ type: 'set-category', category: 'Dev Tools' })
        result.current.dispatch({ type: 'set-search', query: 'react' })
      })
      expect(result.current.filteredBookmarks).toHaveLength(1)
      expect(result.current.filteredBookmarks[0].title).toBe('React')
    })

    it('sorts by sortOrder then createdAt', () => {
      mockUseBookmarks.mockReturnValue([
        makeBookmark({ _id: 'a' as Id<'bookmarks'>, title: 'B', sortOrder: 1, createdAt: 2000 }),
        makeBookmark({ _id: 'b' as Id<'bookmarks'>, title: 'A', sortOrder: 1, createdAt: 1000 }),
        makeBookmark({ _id: 'c' as Id<'bookmarks'>, title: 'C', sortOrder: 0, createdAt: 3000 }),
      ])
      const { result } = renderHook(() => useBookmarkListState())
      expect(result.current.filteredBookmarks.map(b => b.title)).toEqual(['C', 'A', 'B'])
    })

    it('ignores blank search query', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-search', query: '   ' }))
      expect(result.current.filteredBookmarks).toHaveLength(3)
    })
  })

  describe('handleDelete', () => {
    it('does nothing when no deleteTarget', async () => {
      const { result } = renderHook(() => useBookmarkListState())
      await act(() => result.current.handleDelete())
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('removes bookmark and clears delete state on success', async () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() =>
        result.current.dispatch({ type: 'set-delete-target', bookmark: defaultBookmarks[0] })
      )
      await act(() => result.current.handleDelete())
      expect(mockRemove).toHaveBeenCalledWith({ id: 'bk_1' })
      expect(result.current.state.deleteTarget).toBeNull()
      expect(result.current.state.deleteError).toBeNull()
    })

    it('sets error message on Error failure', async () => {
      mockRemove.mockRejectedValueOnce(new Error('Network error'))
      const { result } = renderHook(() => useBookmarkListState())
      act(() =>
        result.current.dispatch({ type: 'set-delete-target', bookmark: defaultBookmarks[0] })
      )
      await act(() => result.current.handleDelete())
      expect(result.current.state.deleteError).toBe('Network error')
    })

    it('sets fallback error for non-Error failure', async () => {
      mockRemove.mockRejectedValueOnce('string error')
      const { result } = renderHook(() => useBookmarkListState())
      act(() =>
        result.current.dispatch({ type: 'set-delete-target', bookmark: defaultBookmarks[0] })
      )
      await act(() => result.current.handleDelete())
      expect(result.current.state.deleteError).toBe('Failed to delete bookmark')
    })
  })

  describe('drag and drop', () => {
    it('handleDragOver prevents default for uri-list type', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        dataTransfer: {
          types: ['text/uri-list'],
          dropEffect: '',
        },
        preventDefault: vi.fn(),
      }
      act(() => result.current.handleDragOver(e as unknown as React.DragEvent))
      expect(e.preventDefault).toHaveBeenCalled()
      expect(e.dataTransfer.dropEffect).toBe('copy')
      expect(result.current.state.dragOver).toBe(true)
    })

    it('handleDragOver prevents default for text/plain type', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        dataTransfer: { types: ['text/plain'], dropEffect: '' },
        preventDefault: vi.fn(),
      }
      act(() => result.current.handleDragOver(e as unknown as React.DragEvent))
      expect(e.preventDefault).toHaveBeenCalled()
    })

    it('handleDragOver ignores non-matching types', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        dataTransfer: { types: ['application/json'], dropEffect: '' },
        preventDefault: vi.fn(),
      }
      act(() => result.current.handleDragOver(e as unknown as React.DragEvent))
      expect(e.preventDefault).not.toHaveBeenCalled()
    })

    it('handleDragLeave resets dragOver when leaving container', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-drag-over', active: true }))
      const target = document.createElement('div')
      const related = document.createElement('div')
      const e = { currentTarget: target, relatedTarget: related }
      act(() => result.current.handleDragLeave(e as unknown as React.DragEvent))
      expect(result.current.state.dragOver).toBe(false)
    })

    it('handleDragLeave ignores if relatedTarget is still inside', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-drag-over', active: true }))
      const child = document.createElement('span')
      const target = document.createElement('div')
      target.appendChild(child)
      const e = { currentTarget: target, relatedTarget: child }
      act(() => result.current.handleDragLeave(e as unknown as React.DragEvent))
      expect(result.current.state.dragOver).toBe(true)
    })

    it('handleDrop extracts URL from text/uri-list', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (type: string) => {
            if (type === 'text/uri-list') return '# comment\nhttps://dropped.dev'
            if (type === 'text/html') return ''
            return ''
          },
        },
      }
      act(() => result.current.handleDrop(e as unknown as React.DragEvent))
      expect(result.current.state.dialogOpen).toBe(true)
      expect(result.current.state.droppedUrl).toBe('https://dropped.dev')
    })

    it('handleDrop extracts URL from text/plain when uri-list is empty', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (type: string) => {
            if (type === 'text/uri-list') return ''
            if (type === 'text/plain') return 'https://plain.dev'
            if (type === 'text/html') return ''
            return ''
          },
        },
      }
      act(() => result.current.handleDrop(e as unknown as React.DragEvent))
      expect(result.current.state.droppedUrl).toBe('https://plain.dev')
    })

    it('handleDrop extracts title from HTML anchor', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (type: string) => {
            if (type === 'text/uri-list') return 'https://example.com'
            if (type === 'text/html') return '<a href="https://example.com">My Page Title</a>'
            return ''
          },
        },
      }
      act(() => result.current.handleDrop(e as unknown as React.DragEvent))
      expect(result.current.state.droppedTitle).toBe('My Page Title')
    })

    it('handleDrop ignores anchor text that looks like a URL', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (type: string) => {
            if (type === 'text/uri-list') return 'https://example.com'
            if (type === 'text/html') return '<a href="https://example.com">https://example.com</a>'
            return ''
          },
        },
      }
      act(() => result.current.handleDrop(e as unknown as React.DragEvent))
      expect(result.current.state.droppedTitle).toBeNull()
    })

    it('handleDrop does not open dialog for non-URL text', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (type: string) => {
            if (type === 'text/plain') return 'not a url'
            return ''
          },
        },
      }
      act(() => result.current.handleDrop(e as unknown as React.DragEvent))
      expect(result.current.state.dialogOpen).toBe(false)
    })

    it('handleDrop ignores non-http protocols', () => {
      const { result } = renderHook(() => useBookmarkListState())
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (type: string) => {
            if (type === 'text/plain') return 'ftp://files.example.com'
            return ''
          },
        },
      }
      act(() => result.current.handleDrop(e as unknown as React.DragEvent))
      expect(result.current.state.dialogOpen).toBe(false)
    })
  })

  describe('hasFilters', () => {
    it('is false with no filters', () => {
      const { result } = renderHook(() => useBookmarkListState())
      expect(result.current.hasFilters).toBe(false)
    })

    it('is true with searchQuery', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-search', query: 'x' }))
      expect(result.current.hasFilters).toBe(true)
    })

    it('is true with selectedCategory', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-category', category: 'a' }))
      expect(result.current.hasFilters).toBe(true)
    })

    it('is true with selectedTag', () => {
      const { result } = renderHook(() => useBookmarkListState())
      act(() => result.current.dispatch({ type: 'set-tag', tag: 'b' }))
      expect(result.current.hasFilters).toBe(true)
    })
  })
})
