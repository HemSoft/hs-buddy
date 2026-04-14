import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BookmarksSidebar } from './BookmarksSidebar'
import { isSafeImageUrl, buildCategoryTree } from './bookmarksSidebarUtils'

const { mockUseBookmarks, mockUseBookmarkCategories, mockUseBookmarkMutations } = vi.hoisted(
  () => ({
    mockUseBookmarks: vi.fn(),
    mockUseBookmarkCategories: vi.fn(),
    mockUseBookmarkMutations: vi.fn(),
  })
)

vi.mock('../../hooks/useConvex', () => ({
  useBookmarks: mockUseBookmarks,
  useBookmarkCategories: mockUseBookmarkCategories,
  useBookmarkMutations: mockUseBookmarkMutations,
}))

vi.mock('../bookmarks/BookmarkDialog', () => ({
  BookmarkDialog: () => null,
}))

const defaultBookmarks = [
  {
    _id: '1',
    url: 'https://example.com',
    title: 'Example',
    category: 'Dev Tools',
    tags: [],
    sortOrder: 0,
  },
  {
    _id: '2',
    url: 'https://docs.test',
    title: 'Docs',
    category: 'Documentation',
    tags: [],
    sortOrder: 0,
  },
]

function expandCategory(categoryName: string) {
  const chevron = screen
    .getByText(categoryName)
    .closest('.sidebar-item')!
    .querySelector('.sidebar-item-chevron[role="button"]') as HTMLElement
  fireEvent.click(chevron)
}

describe('BookmarksSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseBookmarks.mockReturnValue(defaultBookmarks)
    mockUseBookmarkCategories.mockReturnValue(['Dev Tools', 'Documentation'])
    mockUseBookmarkMutations.mockReturnValue({ reorder: vi.fn() })
  })

  it('renders categories with bookmarks and selects a category', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    expect(screen.getByText('Dev Tools')).toBeInTheDocument()
    expect(screen.getByText('Documentation')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Dev Tools'))
    expect(onItemSelect).toHaveBeenCalledWith('bookmarks-category:Dev Tools')
  })

  it('shows BOOKMARKS header with total count', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('BOOKMARKS')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('selects a bookmark item on click', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    expandCategory('Dev Tools')
    fireEvent.click(screen.getByText('Example').closest('[role="button"]') as HTMLElement)
    expect(onItemSelect).toHaveBeenCalledWith(
      `browser:${encodeURIComponent('https://example.com')}`
    )
  })

  it('expands and collapses a category', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    expect(screen.queryByText('Example')).toBeNull()

    expandCategory('Dev Tools')
    expect(screen.getByText('Example')).toBeInTheDocument()

    expandCategory('Dev Tools')
    expect(screen.queryByText('Example')).toBeNull()
  })

  it('selects a bookmark via keyboard Enter', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    expandCategory('Dev Tools')
    fireEvent.keyDown(screen.getByText('Example').closest('[role="button"]') as HTMLElement, {
      key: 'Enter',
    })
    expect(onItemSelect).toHaveBeenCalledWith(
      `browser:${encodeURIComponent('https://example.com')}`
    )
  })

  it('toggles a category via keyboard Space on chevron', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    const chevron = screen
      .getByText('Dev Tools')
      .closest('.sidebar-item')!
      .querySelector('.sidebar-item-chevron[role="button"]') as HTMLElement

    fireEvent.keyDown(chevron, { key: ' ' })
    expect(screen.getByText('Example')).toBeInTheDocument()
  })

  it('applies selected class to a selected bookmark', () => {
    const selectedItem = `browser:${encodeURIComponent('https://example.com')}`
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={selectedItem} />)

    expandCategory('Dev Tools')
    const bookmarkRow = screen.getByText('Example').closest('.sidebar-item')!
    expect(bookmarkRow.className).toContain('selected')
  })

  it('shows empty state when no bookmarks exist', () => {
    mockUseBookmarks.mockReturnValue([])
    mockUseBookmarkCategories.mockReturnValue([])

    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('No bookmarks yet')).toBeInTheDocument()
  })

  it('renders bookmarks with favicon when safe URL', () => {
    mockUseBookmarks.mockReturnValue([
      {
        _id: '1',
        url: 'https://example.com/page',
        title: 'Example Page',
        favicon: 'https://example.com/favicon.ico',
        category: 'Dev Tools',
        tags: [],
        sortOrder: 0,
      },
    ])
    mockUseBookmarkCategories.mockReturnValue(['Dev Tools'])

    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expandCategory('Dev Tools')
    expect(screen.getByText('Example Page')).toBeInTheDocument()
  })

  it('opens context menu on right-click and closes via overlay', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    expandCategory('Dev Tools')
    const item = screen.getByText('Example').closest('[role="button"]') as HTMLElement
    fireEvent.contextMenu(item)
    expect(screen.getByText('Edit')).toBeInTheDocument()

    // Click overlay to close
    const overlay = document.querySelector('.tab-context-menu-overlay') as HTMLElement
    fireEvent.click(overlay)
    expect(screen.queryByText('Edit')).toBeNull()
  })

  it('opens edit dialog from context menu', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    expandCategory('Dev Tools')
    const item = screen.getByText('Example').closest('[role="button"]') as HTMLElement
    fireEvent.contextMenu(item)
    fireEvent.click(screen.getByText('Edit'))
  })

  it('handles nested category tree with counts', () => {
    mockUseBookmarks.mockReturnValue([
      {
        _id: '1',
        url: 'https://a.com',
        title: 'A',
        category: 'Dev/Frontend',
        tags: [],
        sortOrder: 0,
      },
      {
        _id: '2',
        url: 'https://b.com',
        title: 'B',
        category: 'Dev/Frontend',
        tags: [],
        sortOrder: 0,
      },
      {
        _id: '3',
        url: 'https://c.com',
        title: 'C',
        category: 'Dev/Backend',
        tags: [],
        sortOrder: 0,
      },
    ])
    mockUseBookmarkCategories.mockReturnValue(['Dev/Frontend', 'Dev/Backend'])

    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    // Parent "Dev" should show
    expect(screen.getByText('Dev')).toBeInTheDocument()
    // Total count "3" appears in the BOOKMARKS header and the Dev category
    const counts = screen.getAllByText('3')
    expect(counts.length).toBeGreaterThanOrEqual(2)
  })

  it('closes context menu on Escape key', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    expandCategory('Dev Tools')
    const item = screen.getByText('Example').closest('[role="button"]') as HTMLElement
    fireEvent.contextMenu(item)
    expect(screen.getByText('Edit')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Edit')).toBeNull()
  })

  it('renders loading state when bookmarks are undefined', () => {
    mockUseBookmarks.mockReturnValue(undefined)
    mockUseBookmarkCategories.mockReturnValue(undefined)

    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('BOOKMARKS')).toBeInTheDocument()
  })

  it('supports drag and drop on bookmarks', () => {
    const mockReorder = vi.fn().mockResolvedValue(undefined)
    mockUseBookmarkMutations.mockReturnValue({ reorder: mockReorder })

    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    expandCategory('Dev Tools')
    const item = screen.getByText('Example').closest('[role="button"]') as HTMLElement

    fireEvent.dragStart(item, { dataTransfer: { effectAllowed: '', setData: vi.fn() } })
    fireEvent.dragEnd(item)
  })

  it('applies selected class to category view', () => {
    const selectedItem = 'bookmarks-category:Dev Tools'
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={selectedItem} />)
    const categoryItem = screen.getByText('Dev Tools').closest('.sidebar-item')!
    expect(categoryItem.className).toContain('selected')
  })
})

describe('isSafeImageUrl', () => {
  it('returns true for https URLs', () => {
    expect(isSafeImageUrl('https://example.com/image.png')).toBe(true)
  })

  it('returns true for http URLs', () => {
    expect(isSafeImageUrl('http://example.com/image.png')).toBe(true)
  })

  it('returns false for data URIs', () => {
    expect(isSafeImageUrl('data:image/png;base64,abc')).toBe(false)
  })

  it('returns false for javascript protocol', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false)
  })

  it('returns false for ftp protocol', () => {
    expect(isSafeImageUrl('ftp://example.com/file')).toBe(false)
  })

  it('returns false for malformed URLs', () => {
    expect(isSafeImageUrl('not a url')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isSafeImageUrl('')).toBe(false)
  })

  it('returns false for file protocol', () => {
    expect(isSafeImageUrl('file:///etc/passwd')).toBe(false)
  })
})

describe('buildCategoryTree', () => {
  it('returns empty array for empty categories', () => {
    expect(buildCategoryTree([], {})).toEqual([])
  })

  it('builds flat categories', () => {
    const result = buildCategoryTree(['A', 'B'], { A: 3, B: 5 })
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('A')
    expect(result[0].directCount).toBe(3)
    expect(result[0].totalCount).toBe(3)
    expect(result[1].name).toBe('B')
    expect(result[1].directCount).toBe(5)
    expect(result[1].totalCount).toBe(5)
  })

  it('builds nested category hierarchy', () => {
    const result = buildCategoryTree(['Dev/Frontend', 'Dev/Backend'], {
      'Dev/Frontend': 2,
      'Dev/Backend': 3,
    })
    expect(result).toHaveLength(1) // root "Dev"
    expect(result[0].name).toBe('Dev')
    expect(result[0].children).toHaveLength(2)
    expect(result[0].totalCount).toBe(5) // 2 + 3 rolled up
    expect(result[0].directCount).toBe(0) // no direct items on parent
  })

  it('handles deeply nested paths', () => {
    const result = buildCategoryTree(['A/B/C'], { 'A/B/C': 7 })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('A')
    expect(result[0].totalCount).toBe(7)
    expect(result[0].children[0].name).toBe('B')
    expect(result[0].children[0].totalCount).toBe(7)
    expect(result[0].children[0].children[0].name).toBe('C')
    expect(result[0].children[0].children[0].directCount).toBe(7)
  })

  it('defaults to 0 when count is missing', () => {
    const result = buildCategoryTree(['Uncounted'], {})
    expect(result[0].directCount).toBe(0)
    expect(result[0].totalCount).toBe(0)
  })

  it('handles mixed flat and nested categories', () => {
    const result = buildCategoryTree(['Top', 'Parent/Child'], { Top: 1, 'Parent/Child': 2 })
    expect(result).toHaveLength(2) // "Parent" and "Top"
    const parent = result.find(n => n.name === 'Parent')!
    expect(parent.children).toHaveLength(1)
    expect(parent.totalCount).toBe(2)
  })

  it('sorts categories alphabetically', () => {
    const result = buildCategoryTree(['Z', 'A', 'M'], { Z: 1, A: 2, M: 3 })
    expect(result[0].name).toBe('A')
    expect(result[1].name).toBe('M')
    expect(result[2].name).toBe('Z')
  })

  it('shares parent node for sibling paths', () => {
    const result = buildCategoryTree(['Root/A', 'Root/B', 'Root/C'], {
      'Root/A': 1,
      'Root/B': 2,
      'Root/C': 3,
    })
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(3)
    expect(result[0].totalCount).toBe(6)
  })

  it('preserves fullPath on each node', () => {
    const result = buildCategoryTree(['X/Y/Z'], { 'X/Y/Z': 1 })
    expect(result[0].fullPath).toBe('X')
    expect(result[0].children[0].fullPath).toBe('X/Y')
    expect(result[0].children[0].children[0].fullPath).toBe('X/Y/Z')
  })
})
