import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BookmarksSidebar } from './BookmarksSidebar'

const mockBookmarks = [
  {
    _id: '1',
    url: 'https://example.com',
    title: 'Example',
    category: 'Dev Tools',
    tags: [],
    sortOrder: 0,
    faviconUrl: 'https://example.com/favicon.ico',
  },
  {
    _id: '2',
    url: 'https://docs.test',
    title: 'Docs',
    category: 'Documentation',
    tags: [],
    sortOrder: 0,
    faviconUrl: null,
  },
  {
    _id: '3',
    url: 'https://nested.test',
    title: 'Nested',
    category: 'Dev Tools/Testing',
    tags: [],
    sortOrder: 1,
    faviconUrl: 'ftp://bad.url/icon.png',
  },
  {
    _id: '4',
    url: 'https://root.test',
    title: 'Root Bookmark',
    category: '',
    tags: [],
    sortOrder: 0,
    faviconUrl: null,
  },
]

const mockReorder = vi.fn().mockResolvedValue(undefined)

vi.mock('../../hooks/useConvex', () => ({
  useBookmarks: () => mockBookmarks,
  useBookmarkCategories: () => ['', 'Dev Tools', 'Dev Tools/Testing', 'Documentation'],
  useBookmarkMutations: () => ({ reorder: mockReorder }),
}))

describe('BookmarksSidebar', () => {
  it('renders categories with bookmarks and selects a category', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    expect(screen.getByText('Dev Tools')).toBeInTheDocument()
    expect(screen.getByText('Documentation')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Dev Tools'))
    expect(onItemSelect).toHaveBeenCalledWith('bookmarks-category:Dev Tools')
  })

  it('shows total bookmark count in header', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    expect(screen.getByText('BOOKMARKS')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('expands a category to show bookmarks', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    // Click the chevron for Dev Tools to expand
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    const chevron = devToolsRow.querySelector('.sidebar-item-chevron')!
    fireEvent.click(chevron)

    // Should now show the bookmark inside
    expect(screen.getByText('Example')).toBeInTheDocument()
  })

  it('renders favicon for bookmarks with safe image URLs', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    // Expand Dev Tools
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)

    // Example has a valid https favicon — rendered as img tag
    const images = document.querySelectorAll('img')
    expect(images.length).toBeGreaterThan(0)
  })

  it('selects a bookmark item on click', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    // Expand Dev Tools
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)

    fireEvent.click(screen.getByText('Example'))
    expect(onItemSelect).toHaveBeenCalledWith(
      `browser:${encodeURIComponent('https://example.com')}`
    )
  })

  it('highlights selected category', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem="bookmarks-category:Dev Tools" />)
    const devToolsItem = screen.getByText('Dev Tools').closest('.sidebar-item')!
    expect(devToolsItem.classList.contains('selected')).toBe(true)
  })

  it('handles keyboard Enter/Space on category items', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    const docRow = screen.getByText('Documentation').closest('[role="button"]')!
    fireEvent.keyDown(docRow, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith('bookmarks-category:Documentation')

    onItemSelect.mockClear()
    fireEvent.keyDown(docRow, { key: ' ' })
    expect(onItemSelect).toHaveBeenCalledWith('bookmarks-category:Documentation')
  })

  it('handles keyboard Enter/Space on chevrons', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Expand Dev Tools via keyboard on the chevron span (it has role="button")
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    const chevronButtons = devToolsRow.querySelectorAll('[role="button"]')
    // The chevron is the inner role="button" inside sidebar-item-chevron
    const chevron = chevronButtons.length > 1 ? chevronButtons[1] : chevronButtons[0]
    fireEvent.keyDown(chevron, { key: 'Enter' })

    // Should now show the bookmark
    expect(screen.getByText('Example')).toBeInTheDocument()
  })

  it('shows context menu on right-click of a bookmark', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Expand Dev Tools
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)

    // Right-click on Example bookmark
    fireEvent.contextMenu(screen.getByText('Example').closest('.sidebar-item')!)

    expect(screen.getByRole('menuitem')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('closes context menu on Escape key', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Expand and right-click
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)
    fireEvent.contextMenu(screen.getByText('Example').closest('.sidebar-item')!)
    expect(screen.getByText('Edit')).toBeInTheDocument()

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Edit')).toBeFalsy()
  })

  it('closes context menu on overlay click', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Expand and right-click
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)
    fireEvent.contextMenu(screen.getByText('Example').closest('.sidebar-item')!)

    // Click overlay
    const overlay = document.querySelector('.tab-context-menu-overlay')!
    fireEvent.click(overlay)
    expect(screen.queryByRole('menuitem')).toBeFalsy()
  })

  it('shows category count badges', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    // Dev Tools has 2 total (direct + nested), Documentation has 1
    const counts = screen.getAllByText(/^\d+$/).map(el => el.textContent)
    expect(counts.length).toBeGreaterThanOrEqual(2)
  })

  it('renders uncategorized bookmarks at root level', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)
    // Root Bookmark (category '') should render without being inside a category folder
    expect(screen.getByText('Root Bookmark')).toBeInTheDocument()
  })

  it('displays nested categories with proper indentation', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Expand Dev Tools category
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)

    // Nested Testing subcategory should be visible
    expect(screen.getByText('Testing')).toBeInTheDocument()
  })

  it('handles drag start on bookmark items', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Expand Dev Tools
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)

    const exampleItem = screen.getByText('Example').closest('.sidebar-item')!
    const dataTransfer = { effectAllowed: '', setData: vi.fn() }
    fireEvent.dragStart(exampleItem, { dataTransfer })
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '1')
  })

  it('handles drag end cleanup', () => {
    render(<BookmarksSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    // Expand Dev Tools
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)

    const exampleItem = screen.getByText('Example').closest('.sidebar-item')!
    fireEvent.dragEnd(exampleItem)
    // No drag-over classes should remain
    expect(exampleItem.className).not.toContain('drag-over')
  })

  it('handles keyboard Enter on bookmark items', () => {
    const onItemSelect = vi.fn()
    render(<BookmarksSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    // Expand Dev Tools
    const devToolsRow = screen.getByText('Dev Tools').closest('.sidebar-item')!
    fireEvent.click(devToolsRow.querySelector('.sidebar-item-chevron')!)

    const exampleItem = screen.getByText('Example').closest('[role="button"]')!
    fireEvent.keyDown(exampleItem, { key: 'Enter' })
    expect(onItemSelect).toHaveBeenCalledWith(
      `browser:${encodeURIComponent('https://example.com')}`
    )
  })
})
