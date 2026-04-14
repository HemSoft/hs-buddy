import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BookmarkDialog } from './BookmarkDialog'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockFetchPageTitle = vi.fn()
const mockQuickPrompt = vi.fn()

vi.mock('../../hooks/useConvex', () => ({
  useBookmarkMutations: () => ({
    create: mockCreate,
    update: mockUpdate,
  }),
}))

describe('BookmarkDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    window.shell = {
      openExternal: vi.fn() as never,
      openInAppBrowser: vi.fn() as never,
      fetchPageTitle: mockFetchPageTitle as never,
    }

    window.copilot = {
      execute: vi.fn() as never,
      cancel: vi.fn() as never,
      getActiveCount: vi.fn() as never,
      listModels: vi.fn() as never,
      chatSend: vi.fn() as never,
      chatAbort: vi.fn() as never,
      quickPrompt: mockQuickPrompt as never,
    }
  })

  it('waits for the initial title fetch before requesting AI suggestions', async () => {
    mockFetchPageTitle.mockResolvedValue({
      success: true,
      title: 'Example title',
    })
    mockQuickPrompt.mockResolvedValue(
      JSON.stringify({
        description: 'Short summary',
        tags: ['docs', 'guide', 'test'],
      })
    )

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockFetchPageTitle).toHaveBeenCalledWith('https://example.com')
    })

    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalledTimes(1)
    })

    expect(mockQuickPrompt.mock.calls[0][0].prompt).toContain('Title: Example title')

    await waitFor(() => {
      expect(screen.getByDisplayValue('Example title')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Short summary')).toBeInTheDocument()
      expect(screen.getByDisplayValue('docs, guide, test')).toBeInTheDocument()
    })
  })

  it('focuses the URL field when creating a bookmark', () => {
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    expect(screen.getByPlaceholderText('https://example.com')).toHaveFocus()
  })

  it('focuses the title field when editing a bookmark', () => {
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bookmark-1',
            url: 'https://example.com',
            title: 'Existing bookmark',
            category: 'Documentation',
          } as never
        }
        categories={['Documentation']}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('Existing bookmark')).toHaveFocus()
  })

  it('shows error when URL is empty on submit', () => {
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Bookmark' }))
    expect(screen.getByText('URL is required')).toBeInTheDocument()
  })

  it('shows error when title is empty on submit', () => {
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={vi.fn()} />)
    const urlInput = screen.getByPlaceholderText('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'https://test.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Bookmark' }))
    expect(screen.getByText('Title is required')).toBeInTheDocument()
  })

  it('shows error when category is empty on submit', () => {
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={vi.fn()} />)
    const urlInput = screen.getByPlaceholderText('https://example.com')
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(urlInput, { target: { value: 'https://test.com' } })
    fireEvent.change(titleInput, { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Bookmark' }))
    expect(screen.getByText('Category is required')).toBeInTheDocument()
  })

  it('rejects non-http/https URLs', () => {
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={vi.fn()} />)
    const urlInput = screen.getByPlaceholderText('https://example.com')
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(urlInput, { target: { value: 'ftp://files.example.com' } })
    fireEvent.change(titleInput, { target: { value: 'Test' } })
    const categorySelect = screen.getByRole('combobox')
    fireEvent.change(categorySelect, { target: { value: 'Docs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Bookmark' }))
    expect(screen.getByText('Only http and https URLs are allowed')).toBeInTheDocument()
  })

  it('rejects invalid URLs', () => {
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={vi.fn()} />)
    const urlInput = screen.getByPlaceholderText('https://example.com')
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(urlInput, { target: { value: 'not-a-url' } })
    fireEvent.change(titleInput, { target: { value: 'Test' } })
    const categorySelect = screen.getByRole('combobox')
    fireEvent.change(categorySelect, { target: { value: 'Docs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Bookmark' }))
    expect(screen.getByText(/please enter a valid url/i)).toBeInTheDocument()
  })

  it('rejects more than 50 tags', () => {
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={vi.fn()} />)
    const urlInput = screen.getByPlaceholderText('https://example.com')
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    const tagsInput = screen.getByPlaceholderText('tag1, tag2, tag3')
    fireEvent.change(urlInput, { target: { value: 'https://test.com' } })
    fireEvent.change(titleInput, { target: { value: 'Test' } })
    const categorySelect = screen.getByRole('combobox')
    fireEvent.change(categorySelect, { target: { value: 'Docs' } })
    const tags = Array.from({ length: 51 }, (_, i) => `tag${i}`).join(', ')
    fireEvent.change(tagsInput, { target: { value: tags } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Bookmark' }))
    expect(screen.getByText('Maximum 50 tags allowed')).toBeInTheDocument()
  })

  it('calls create on successful submit', async () => {
    mockCreate.mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={onClose} />)
    const urlInput = screen.getByPlaceholderText('https://example.com')
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(urlInput, { target: { value: 'https://test.com' } })
    fireEvent.change(titleInput, { target: { value: 'My Test' } })
    const categorySelect = screen.getByRole('combobox')
    fireEvent.change(categorySelect, { target: { value: 'Docs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Bookmark' }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.com',
          title: 'My Test',
          category: 'Docs',
        })
      )
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('calls update when editing existing bookmark', async () => {
    mockUpdate.mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm1',
            url: 'https://example.com',
            title: 'Old title',
            category: 'Docs',
          } as never
        }
        categories={['Docs']}
        onClose={onClose}
      />
    )
    const titleInput = screen.getByDisplayValue('Old title')
    fireEvent.change(titleInput, { target: { value: 'New title' } })
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'bm1',
          title: 'New title',
        })
      )
    })
  })

  it('closes dialog on Escape key', () => {
    const onClose = vi.fn()
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes dialog when clicking overlay', () => {
    const onClose = vi.fn()
    const { container } = render(
      <BookmarkDialog bookmark={null} categories={['Docs']} onClose={onClose} />
    )
    const overlay = container.querySelector('.bookmark-dialog-overlay')!
    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows text input for category in edit mode', () => {
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm1',
            url: 'https://example.com',
            title: 'Title',
            category: 'Dev Tools',
          } as never
        }
        categories={['Dev Tools', 'Documentation']}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('Dev Tools')).toBeInTheDocument()
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })

  it('shows "New" button for category in create mode', () => {
    render(<BookmarkDialog bookmark={null} categories={['Docs']} onClose={vi.fn()} />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('switches to new category input when New is clicked', () => {
    render(<BookmarkDialog bookmark={null} categories={['Docs', 'Dev Tools']} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('New'))
    expect(screen.getByText('Existing')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Category/Subcategory')).toBeInTheDocument()
  })

  it('handles AI JSON parse failure silently', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Test' })
    mockQuickPrompt.mockResolvedValue('This is not valid JSON at all')
    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Docs']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalled()
    })
    // Should not crash — description should remain empty
    const descTextarea = screen.getByPlaceholderText('Optional description…')
    expect(descTextarea).toHaveValue('')
  })
})
