import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BookmarksSidebar } from './BookmarksSidebar'

vi.mock('../../hooks/useConvex', () => ({
  useBookmarks: () => [
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
  ],
  useBookmarkCategories: () => ['Dev Tools', 'Documentation'],
  useBookmarkMutations: () => ({ reorder: vi.fn() }),
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
})
