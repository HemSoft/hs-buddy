import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('opens bookmark URL on double click and records visit', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<BookmarkList />)
    const card = screen.getByText('GitHub').closest('.bookmark-card')!
    fireEvent.doubleClick(card)
    expect(mockRecordVisit).toHaveBeenCalledWith({ id: 'bm1' })
    expect(openSpy).toHaveBeenCalledWith('https://github.com', '_blank', 'noopener,noreferrer')
    openSpy.mockRestore()
  })
})
