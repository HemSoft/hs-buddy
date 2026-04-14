import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BookmarkList } from './BookmarkList'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()
const mockRecordVisit = vi.fn()

const mockBookmarks = [
  {
    _id: 'bm1' as never,
    url: 'https://github.com',
    title: 'GitHub',
    description: 'Code hosting',
    category: 'Dev Tools',
    tags: ['code', 'git'],
    sortOrder: 0,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    _id: 'bm2' as never,
    url: 'https://docs.example.com',
    title: 'Example Docs',
    category: 'Documentation',
    tags: ['docs'],
    sortOrder: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

let mockBookmarksReturn: typeof mockBookmarks | undefined = mockBookmarks
let mockCategoriesReturn: string[] | undefined = ['Dev Tools', 'Documentation']

vi.mock('../../hooks/useConvex', () => ({
  useBookmarks: () => mockBookmarksReturn,
  useBookmarkCategories: () => mockCategoriesReturn,
  useBookmarkMutations: () => ({
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
    recordVisit: mockRecordVisit,
  }),
}))

describe('BookmarkList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBookmarksReturn = mockBookmarks
    mockCategoriesReturn = ['Dev Tools', 'Documentation']
    window.shell = {
      openExternal: vi.fn() as never,
      openInAppBrowser: vi.fn() as never,
      fetchPageTitle: vi.fn().mockResolvedValue({ title: '' }) as never,
    }
    window.copilot = {
      ...window.copilot,
      quickPrompt: vi.fn().mockResolvedValue('{}') as never,
    } as typeof window.copilot
  })

  it('renders loading state when data is undefined', () => {
    mockBookmarksReturn = undefined
    render(<BookmarkList />)
    expect(screen.getByText('Loading bookmarks…')).toBeInTheDocument()
  })

  it('renders empty state when no bookmarks exist', () => {
    mockBookmarksReturn = []
    render(<BookmarkList />)
    expect(screen.getByText('No bookmarks yet')).toBeInTheDocument()
  })

  it('renders bookmark cards with title and URL', () => {
    render(<BookmarkList />)
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('https://github.com')).toBeInTheDocument()
    expect(screen.getByText('Example Docs')).toBeInTheDocument()
  })

  it('renders category badges', () => {
    render(<BookmarkList />)
    const cards = document.querySelectorAll('.bookmark-card-category')
    const categoryTexts = [...cards].map(c => c.textContent)
    expect(categoryTexts).toContain('Dev Tools')
    expect(categoryTexts).toContain('Documentation')
  })

  it('renders tag badges', () => {
    render(<BookmarkList />)
    const tags = document.querySelectorAll('.bookmark-card-tag')
    const tagTexts = [...tags].map(t => t.textContent)
    expect(tagTexts).toContain('code')
    expect(tagTexts).toContain('git')
    expect(tagTexts).toContain('docs')
  })

  it('filters by search query', () => {
    render(<BookmarkList />)
    const searchInput = screen.getByPlaceholderText('Search bookmarks…')
    fireEvent.change(searchInput, { target: { value: 'GitHub' } })
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.queryByText('Example Docs')).not.toBeInTheDocument()
  })

  it('filters by category selection', () => {
    render(<BookmarkList />)
    const categorySelect = screen.getByTitle('Filter by category')
    fireEvent.change(categorySelect, { target: { value: 'Dev Tools' } })
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.queryByText('Example Docs')).not.toBeInTheDocument()
  })

  it('filters by tag selection', () => {
    render(<BookmarkList />)
    const tagSelect = screen.getByTitle('Filter by tag')
    fireEvent.change(tagSelect, { target: { value: 'docs' } })
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
    expect(screen.getByText('Example Docs')).toBeInTheDocument()
  })

  it('filters when filterCategory prop is provided', () => {
    render(<BookmarkList filterCategory="Documentation" />)
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
    expect(screen.getByText('Example Docs')).toBeInTheDocument()
  })

  it('shows no-match state when filters exclude everything', () => {
    render(<BookmarkList />)
    const searchInput = screen.getByPlaceholderText('Search bookmarks…')
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })
    expect(screen.getByText('No bookmarks match your filters')).toBeInTheDocument()
  })

  it('opens add dialog when Add button is clicked', () => {
    render(<BookmarkList />)
    fireEvent.click(screen.getByTitle('Add bookmark'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add Bookmark' })).toBeInTheDocument()
  })

  it('renders the header with title', () => {
    render(<BookmarkList />)
    expect(screen.getByRole('heading', { name: 'Bookmarks' })).toBeInTheDocument()
  })

  it('opens bookmark in app browser on card click and records visit', () => {
    const openInAppBrowserSpy = vi.fn()
    window.shell.openInAppBrowser = openInAppBrowserSpy as never
    render(<BookmarkList />)
    const card = screen.getByText('GitHub').closest('.bookmark-card')!
    fireEvent.click(card)
    expect(mockRecordVisit).toHaveBeenCalledWith({ id: 'bm1' })
    expect(openInAppBrowserSpy).toHaveBeenCalledWith('https://github.com', 'GitHub')
  })

  it('opens bookmark in external browser when link button is clicked', () => {
    const openExternalSpy = vi.fn()
    window.shell.openExternal = openExternalSpy as never
    render(<BookmarkList />)
    const externalBtn = screen.getAllByTitle('Open in external browser')[0]
    fireEvent.click(externalBtn)
    expect(mockRecordVisit).toHaveBeenCalledWith({ id: 'bm1' })
    expect(openExternalSpy).toHaveBeenCalledWith('https://github.com')
  })

  it('opens bookmark on Enter key press', () => {
    const openInAppBrowserSpy = vi.fn()
    window.shell.openInAppBrowser = openInAppBrowserSpy as never
    render(<BookmarkList />)
    const card = screen.getByText('GitHub').closest('.bookmark-card')!
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(mockRecordVisit).toHaveBeenCalledWith({ id: 'bm1' })
    expect(openInAppBrowserSpy).toHaveBeenCalledWith('https://github.com', 'GitHub')
  })

  it('opens bookmark on Space key press', () => {
    const openInAppBrowserSpy = vi.fn()
    window.shell.openInAppBrowser = openInAppBrowserSpy as never
    render(<BookmarkList />)
    const card = screen.getByText('GitHub').closest('.bookmark-card')!
    fireEvent.keyDown(card, { key: ' ' })
    expect(mockRecordVisit).toHaveBeenCalledWith({ id: 'bm1' })
    expect(openInAppBrowserSpy).toHaveBeenCalledWith('https://github.com', 'GitHub')
  })

  it('opens edit dialog when edit button is clicked', () => {
    render(<BookmarkList />)
    const editBtn = screen.getAllByTitle('Edit')[0]
    fireEvent.click(editBtn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit Bookmark' })).toBeInTheDocument()
  })

  it('shows delete confirmation when delete button is clicked', async () => {
    render(<BookmarkList />)
    const deleteBtn = screen.getAllByTitle('Delete')[0]
    fireEvent.click(deleteBtn)
    expect(screen.getByText('Delete "GitHub"?')).toBeInTheDocument()
    // Confirm delete
    const confirmBtn = screen.getByRole('alertdialog').querySelector('.confirm-dialog-btn-danger')!
    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith({ id: 'bm1' })
    })
  })

  it('shows description when bookmark has one', () => {
    render(<BookmarkList />)
    expect(screen.getByText('Code hosting')).toBeInTheDocument()
  })

  it('uses onOpenTab callback when provided instead of shell.openInAppBrowser', () => {
    const onOpenTab = vi.fn()
    render(<BookmarkList onOpenTab={onOpenTab} />)
    const card = screen.getByText('GitHub').closest('.bookmark-card')!
    fireEvent.click(card)
    expect(onOpenTab).toHaveBeenCalledWith('browser:https%3A%2F%2Fgithub.com')
    expect(window.shell.openInAppBrowser).not.toHaveBeenCalled()
  })

  it('clears all filters when clear filters button is clicked', () => {
    render(<BookmarkList />)
    // Set a search filter first
    const searchInput = screen.getByPlaceholderText('Search bookmarks…')
    fireEvent.change(searchInput, { target: { value: 'GitHub' } })
    expect(screen.queryByText('Example Docs')).not.toBeInTheDocument()

    // Clear filters
    const clearBtn = screen.getByTitle('Clear filters')
    fireEvent.click(clearBtn)
    expect(screen.getByText('Example Docs')).toBeInTheDocument()
    expect(searchInput).toHaveValue('')
  })

  it('sorts bookmarks by sortOrder then createdAt', () => {
    const sorted = [
      {
        _id: 'bm-first' as never,
        url: 'https://first.com',
        title: 'First',
        category: 'Dev Tools',
        tags: [],
        sortOrder: 0,
        createdAt: Date.now() - 200000,
        updatedAt: Date.now(),
      },
      {
        _id: 'bm-second' as never,
        url: 'https://second.com',
        title: 'Second',
        category: 'Dev Tools',
        tags: [],
        sortOrder: 0,
        createdAt: Date.now() - 100000,
        updatedAt: Date.now(),
      },
      {
        _id: 'bm-third' as never,
        url: 'https://third.com',
        title: 'Third',
        category: 'Dev Tools',
        tags: [],
        sortOrder: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]
    mockBookmarksReturn = sorted
    render(<BookmarkList />)
    const titles = [...document.querySelectorAll('.bookmark-card-title')].map(el => el.textContent)
    expect(titles).toEqual(['First', 'Second', 'Third'])
  })

  it('shows delete error when remove fails', async () => {
    mockRemove.mockRejectedValueOnce(new Error('Server error'))
    render(<BookmarkList />)
    const deleteBtn = screen.getAllByTitle('Delete')[0]
    fireEvent.click(deleteBtn)
    expect(screen.getByText('Delete "GitHub"?')).toBeInTheDocument()
    const confirmBtn = screen.getByRole('alertdialog').querySelector('.confirm-dialog-btn-danger')!
    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('applies drag-over class during drag', () => {
    render(<BookmarkList />)
    const container = document.querySelector('.bookmark-list-container')!
    fireEvent.dragOver(container, {
      dataTransfer: { types: ['text/uri-list'], dropEffect: '' },
    })
    expect(container.classList.contains('bookmark-drop-active')).toBe(true)
  })

  it('removes drag-over class on drag leave', () => {
    render(<BookmarkList />)
    const container = document.querySelector('.bookmark-list-container')!
    fireEvent.dragOver(container, {
      dataTransfer: { types: ['text/uri-list'], dropEffect: '' },
    })
    expect(container.classList.contains('bookmark-drop-active')).toBe(true)
    fireEvent.dragLeave(container, {
      relatedTarget: document.body,
    })
    expect(container.classList.contains('bookmark-drop-active')).toBe(false)
  })

  it('opens add dialog with dropped URL on drop', async () => {
    render(<BookmarkList />)
    const container = document.querySelector('.bookmark-list-container')!
    fireEvent.drop(container, {
      dataTransfer: {
        types: ['text/uri-list'],
        getData: (type: string) => {
          if (type === 'text/uri-list') return 'https://example.com/dropped'
          return ''
        },
      },
    })
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('clears search when clear search button is clicked', () => {
    render(<BookmarkList />)
    const searchInput = screen.getByPlaceholderText('Search bookmarks…')
    fireEvent.change(searchInput, { target: { value: 'test' } })
    expect(searchInput).toHaveValue('test')
    const clearBtn = screen.getByTitle('Clear search')
    fireEvent.click(clearBtn)
    expect(searchInput).toHaveValue('')
  })

  it('filters by description text in search', () => {
    render(<BookmarkList />)
    const searchInput = screen.getByPlaceholderText('Search bookmarks…')
    fireEvent.change(searchInput, { target: { value: 'hosting' } })
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.queryByText('Example Docs')).not.toBeInTheDocument()
  })

  it('filters by tag text in search', () => {
    render(<BookmarkList />)
    const searchInput = screen.getByPlaceholderText('Search bookmarks…')
    fireEvent.change(searchInput, { target: { value: 'git' } })
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.queryByText('Example Docs')).not.toBeInTheDocument()
  })

  it('matches subcategory bookmarks when parent category is selected', () => {
    mockBookmarksReturn = [
      ...mockBookmarks,
      {
        _id: 'bm3' as never,
        url: 'https://vitest.dev',
        title: 'Vitest',
        category: 'Dev Tools/Testing',
        tags: [],
        sortOrder: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]
    mockCategoriesReturn = ['Dev Tools', 'Dev Tools/Testing', 'Documentation']
    render(<BookmarkList />)
    const categorySelect = screen.getByTitle('Filter by category')
    fireEvent.change(categorySelect, { target: { value: 'Dev Tools' } })
    // Should show both Dev Tools and Dev Tools/Testing bookmarks
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('Vitest')).toBeInTheDocument()
    expect(screen.queryByText('Example Docs')).not.toBeInTheDocument()
  })
})
