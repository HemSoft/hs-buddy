import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

  it('shows validation error when URL is empty on submit', async () => {
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('URL is required')).toBeInTheDocument()
    })
  })

  it('shows validation error when title is empty on submit', async () => {
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    const urlInput = screen.getByPlaceholderText('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument()
    })
  })

  it('shows validation error when category is empty on submit', async () => {
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    const urlInput = screen.getByPlaceholderText('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } })
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(titleInput, { target: { value: 'Test Bookmark' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('Category is required')).toBeInTheDocument()
    })
  })

  it('shows validation error for invalid URL format', async () => {
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    const urlInput = screen.getByPlaceholderText('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'not-a-url' } })
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(titleInput, { target: { value: 'Test' } })
    const categorySelect = screen.getByDisplayValue('Select category…')
    fireEvent.change(categorySelect, { target: { value: 'Documentation' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(
        screen.getByText('Please enter a valid URL (e.g., https://example.com)')
      ).toBeInTheDocument()
    })
  })

  it('shows validation error for non-http protocol', async () => {
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    const urlInput = screen.getByPlaceholderText('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'ftp://files.example.com' } })
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(titleInput, { target: { value: 'FTP Server' } })
    const categorySelect = screen.getByDisplayValue('Select category…')
    fireEvent.change(categorySelect, { target: { value: 'Documentation' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('Only http and https URLs are allowed')).toBeInTheDocument()
    })
  })

  it('shows validation error when too many tags', async () => {
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    const urlInput = screen.getByPlaceholderText('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } })
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(titleInput, { target: { value: 'Test' } })
    const categorySelect = screen.getByDisplayValue('Select category…')
    fireEvent.change(categorySelect, { target: { value: 'Documentation' } })
    const tagsInput = screen.getByPlaceholderText('tag1, tag2, tag3')
    const manyTags = Array.from({ length: 51 }, (_, i) => `tag${i}`).join(', ')
    fireEvent.change(tagsInput, { target: { value: manyTags } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('Maximum 50 tags allowed')).toBeInTheDocument()
    })
  })

  it('successfully creates a bookmark on valid submit', async () => {
    const onClose = vi.fn()
    mockCreate.mockResolvedValue(undefined)
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    const urlInput = screen.getByPlaceholderText('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } })
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(titleInput, { target: { value: 'Example Site' } })
    const categorySelect = screen.getByDisplayValue('Select category…')
    fireEvent.change(categorySelect, { target: { value: 'Documentation' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          title: 'Example Site',
          category: 'Documentation',
        })
      )
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('successfully updates an existing bookmark on submit', async () => {
    const onClose = vi.fn()
    mockUpdate.mockResolvedValue(undefined)
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm-1',
            url: 'https://old.com',
            title: 'Old Title',
            category: 'Dev Tools',
          } as never
        }
        categories={['Dev Tools', 'Documentation']}
        onClose={onClose}
      />
    )

    const titleInput = screen.getByDisplayValue('Old Title')
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'bm-1',
          title: 'Updated Title',
        })
      )
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows error when create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Server error'))
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    const urlInput = screen.getByPlaceholderText('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } })
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    fireEvent.change(titleInput, { target: { value: 'Test' } })
    const categorySelect = screen.getByDisplayValue('Select category…')
    fireEvent.change(categorySelect, { target: { value: 'Documentation' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('closes dialog on overlay click when mouseDown started on overlay', () => {
    const onClose = vi.fn()
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    const overlay = document.querySelector('.bookmark-dialog-overlay')!
    fireEvent.mouseDown(overlay, { target: overlay })
    fireEvent.click(overlay, { target: overlay })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close dialog on overlay click when mouseDown started inside dialog', () => {
    const onClose = vi.fn()
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    const dialog = document.querySelector('.bookmark-dialog')!
    const overlay = document.querySelector('.bookmark-dialog-overlay')!
    // mouseDown on dialog bubbles to overlay's onMouseDown, setting mouseDownTarget to dialog
    fireEvent.mouseDown(dialog)
    // click directly on overlay: e.target === e.currentTarget but mouseDownTarget !== currentTarget
    fireEvent.click(overlay)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes dialog on Escape key', () => {
    const onClose = vi.fn()
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('allows switching to new category mode', () => {
    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation', 'Dev Tools']}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('Select category…')).toBeInTheDocument()
    fireEvent.click(screen.getByText('New'))
    expect(screen.getByPlaceholderText('Category/Subcategory')).toBeInTheDocument()
  })

  it('allows switching back to existing category mode', () => {
    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation', 'Dev Tools']}
        onClose={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('New'))
    expect(screen.getByText('Existing')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Existing'))
    expect(screen.getByDisplayValue('Select category…')).toBeInTheDocument()
  })

  it('closes dialog via close button', () => {
    const onClose = vi.fn()
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    fireEvent.click(screen.getByTitle('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
