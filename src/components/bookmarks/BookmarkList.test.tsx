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
    faviconUrl: undefined as string | undefined,
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
    faviconUrl: undefined as string | undefined,
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
      fetchPageTitle: vi.fn() as never,
    }
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

  it('opens edit dialog when edit button is clicked', () => {
    render(<BookmarkList />)
    const editBtns = screen.getAllByTitle('Edit')
    fireEvent.click(editBtns[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Edit Bookmark' })).toBeInTheDocument()
  })

  it('opens delete confirmation when delete button is clicked', () => {
    render(<BookmarkList />)
    const deleteBtns = screen.getAllByTitle('Delete')
    fireEvent.click(deleteBtns[0])
    expect(screen.getByText('Delete "GitHub"?')).toBeInTheDocument()
  })

  it('calls remove and closes dialog on delete confirm', async () => {
    mockRemove.mockResolvedValue(undefined)
    render(<BookmarkList />)
    const deleteBtns = screen.getAllByTitle('Delete')
    fireEvent.click(deleteBtns[0])

    const confirmBtn = screen.getByText('Delete')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith({ id: 'bm1' })
    })
  })

  it('cancels delete and closes confirmation dialog', () => {
    render(<BookmarkList />)
    const deleteBtns = screen.getAllByTitle('Delete')
    fireEvent.click(deleteBtns[0])
    expect(screen.getByText('Delete "GitHub"?')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Delete "GitHub"?')).not.toBeInTheDocument()
  })

  it('shows clear search button when search query is present', () => {
    render(<BookmarkList />)
    const searchInput = screen.getByPlaceholderText('Search bookmarks…')
    fireEvent.change(searchInput, { target: { value: 'test' } })
    const clearBtn = screen.getByTitle('Clear search')
    fireEvent.click(clearBtn)
    expect((searchInput as HTMLInputElement).value).toBe('')
  })

  it('shows clear filters button when any filter is active', () => {
    render(<BookmarkList />)
    const categorySelect = screen.getByTitle('Filter by category')
    fireEvent.change(categorySelect, { target: { value: 'Dev Tools' } })
    const clearFiltersBtn = screen.getByTitle('Clear filters')
    fireEvent.click(clearFiltersBtn)
    expect((categorySelect as HTMLSelectElement).value).toBe('')
  })

  it('opens bookmark via keyboard Enter on card', () => {
    const openInAppBrowserSpy = vi.fn()
    window.shell.openInAppBrowser = openInAppBrowserSpy as never
    render(<BookmarkList />)
    const card = screen.getByText('GitHub').closest('[role="button"]')!
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(openInAppBrowserSpy).toHaveBeenCalledWith('https://github.com', 'GitHub')
  })

  it('opens bookmark via keyboard Space on card', () => {
    const openInAppBrowserSpy = vi.fn()
    window.shell.openInAppBrowser = openInAppBrowserSpy as never
    render(<BookmarkList />)
    const card = screen.getByText('GitHub').closest('[role="button"]')!
    fireEvent.keyDown(card, { key: ' ' })
    expect(openInAppBrowserSpy).toHaveBeenCalledWith('https://github.com', 'GitHub')
  })

  it('renders favicon image when faviconUrl is present', () => {
    mockBookmarksReturn = [
      {
        ...mockBookmarks[0],
        faviconUrl: 'https://github.com/favicon.ico',
      },
    ]
    render(<BookmarkList />)
    const img = document.querySelector('.bookmark-favicon') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toContain('favicon.ico')
  })

  it('handles favicon error by hiding image', () => {
    mockBookmarksReturn = [
      {
        ...mockBookmarks[0],
        faviconUrl: 'https://github.com/bad-favicon.ico',
      },
    ]
    render(<BookmarkList />)
    const img = document.querySelector('.bookmark-favicon') as HTMLImageElement
    expect(img).toBeTruthy()

    fireEvent.error(img)
    expect(img.style.display).toBe('none')
  })

  it('shows delete error when removal fails', async () => {
    mockRemove.mockRejectedValue(new Error('Database error'))
    render(<BookmarkList />)
    const deleteBtns = screen.getAllByTitle('Delete')
    fireEvent.click(deleteBtns[0])

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(screen.getByText('Database error')).toBeInTheDocument()
    })
  })

  it('calls onOpenTab when prop is provided', () => {
    const onOpenTab = vi.fn()
    render(<BookmarkList onOpenTab={onOpenTab} />)
    const card = screen.getByText('GitHub').closest('.bookmark-card')!
    fireEvent.click(card)
    expect(onOpenTab).toHaveBeenCalled()
  })
})
