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

  it('skips title fetch when initialTitle is provided', async () => {
    mockQuickPrompt.mockResolvedValue(JSON.stringify({ description: 'A desc', tags: ['a'] }))

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        initialTitle="Pre-filled Title"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('Pre-filled Title')).toBeInTheDocument()
    expect(mockFetchPageTitle).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalledTimes(1)
    })
    expect(mockQuickPrompt.mock.calls[0][0].prompt).toContain('Title: Pre-filled Title')
  })

  it('keeps existing title when titleFetch finishes without a title', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: false })
    mockQuickPrompt.mockResolvedValue('{}')

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockFetchPageTitle).toHaveBeenCalled()
    })

    // title should stay empty since fetch returned no title
    const titleInput = screen.getByPlaceholderText('My Bookmark')
    expect(titleInput).toHaveValue('')
  })

  it('does not override user-edited title from title fetch', async () => {
    let resolveFetch: (v: { success: boolean; title: string }) => void
    mockFetchPageTitle.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )
    mockQuickPrompt.mockResolvedValue('{}')

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    // User types a title before fetch resolves
    const titleInput = screen.getByPlaceholderText('Fetching page title…')
    fireEvent.change(titleInput, { target: { value: 'My Custom Title' } })

    // Now resolve the fetch
    resolveFetch!({ success: true, title: 'Fetched Title' })

    await waitFor(() => {
      expect(mockFetchPageTitle).toHaveBeenCalled()
    })

    // User's title should remain
    expect(screen.getByDisplayValue('My Custom Title')).toBeInTheDocument()
  })

  it('handles title fetch rejection gracefully', async () => {
    mockFetchPageTitle.mockRejectedValue(new Error('Network error'))
    mockQuickPrompt.mockResolvedValue('{}')

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockFetchPageTitle).toHaveBeenCalled()
    })

    // Should still proceed to AI suggestion after failed fetch
    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalledTimes(1)
    })
  })

  it('handles AI quickPrompt rejection gracefully', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Page Title' })
    mockQuickPrompt.mockRejectedValue(new Error('AI service down'))

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalled()
    })

    // AI suggesting indicator should disappear
    await waitFor(() => {
      expect(screen.queryByText('✨ AI suggesting…')).not.toBeInTheDocument()
    })

    spy.mockRestore()
  })

  it('handles AI returning empty text', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Title' })
    mockQuickPrompt.mockResolvedValue('')

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.queryByText('✨ AI suggesting…')).not.toBeInTheDocument()
    })

    // Description and tags should remain empty
    const descInput = screen.getByPlaceholderText('Optional description…') as HTMLTextAreaElement
    expect(descInput.value).toBe('')
  })

  it('handles AI returning non-JSON text', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Title' })
    mockQuickPrompt.mockResolvedValue('This is not JSON at all!')

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.queryByText('✨ AI suggesting…')).not.toBeInTheDocument()
    })

    const descInput = screen.getByPlaceholderText('Optional description…') as HTMLTextAreaElement
    expect(descInput.value).toBe('')
  })

  it('applies only description when AI returns no tags', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Title' })
    mockQuickPrompt.mockResolvedValue(JSON.stringify({ description: 'Only a description' }))

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('Only a description')).toBeInTheDocument()
    })

    const tagsInput = screen.getByPlaceholderText('tag1, tag2, tag3') as HTMLInputElement
    expect(tagsInput.value).toBe('')
  })

  it('applies only tags when AI returns no description', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Title' })
    mockQuickPrompt.mockResolvedValue(JSON.stringify({ tags: ['react', 'hooks'] }))

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('react, hooks')).toBeInTheDocument()
    })

    const descInput = screen.getByPlaceholderText('Optional description…') as HTMLTextAreaElement
    expect(descInput.value).toBe('')
  })

  it('does not override user-edited description with AI suggestion', async () => {
    let resolveAI: (v: string) => void
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Title' })
    mockQuickPrompt.mockReturnValue(
      new Promise(resolve => {
        resolveAI = resolve
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

    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalled()
    })

    // User edits description while AI is pending
    const descInput = screen.getByPlaceholderText(
      'AI is generating a description…'
    ) as HTMLTextAreaElement
    fireEvent.change(descInput, { target: { value: 'My own description' } })

    // Resolve AI
    resolveAI!(JSON.stringify({ description: 'AI description', tags: ['ai'] }))

    await waitFor(() => {
      expect(screen.queryByText('✨ AI suggesting…')).not.toBeInTheDocument()
    })

    // User description should be preserved
    expect(screen.getByDisplayValue('My own description')).toBeInTheDocument()
    // Tags should still be applied since user didn't edit tags
    expect(screen.getByDisplayValue('ai')).toBeInTheDocument()
  })

  it('does not override user-edited tags with AI suggestion', async () => {
    let resolveAI: (v: string) => void
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Title' })
    mockQuickPrompt.mockReturnValue(
      new Promise(resolve => {
        resolveAI = resolve
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

    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalled()
    })

    // User edits tags while AI is pending
    const tagsInput = screen.getByPlaceholderText('AI is suggesting tags…') as HTMLInputElement
    fireEvent.change(tagsInput, { target: { value: 'my-tag' } })

    // Resolve AI
    resolveAI!(JSON.stringify({ description: 'AI desc', tags: ['ai-tag'] }))

    await waitFor(() => {
      expect(screen.queryByText('✨ AI suggesting…')).not.toBeInTheDocument()
    })

    // User tags preserved, AI description applied
    expect(screen.getByDisplayValue('my-tag')).toBeInTheDocument()
    expect(screen.getByDisplayValue('AI desc')).toBeInTheDocument()
  })

  it('selects a parent category in new category mode', () => {
    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Development', 'Documentation']}
        onClose={vi.fn()}
      />
    )

    // Switch to new category mode
    fireEvent.click(screen.getByText('New'))

    // Type a subcategory first
    const newCatInput = screen.getByPlaceholderText('Category/Subcategory')
    fireEvent.change(newCatInput, { target: { value: 'Frontend' } })

    // Select a parent from the dropdown
    const parentSelect = screen.getByDisplayValue('Parent…')
    fireEvent.change(parentSelect, { target: { value: 'Development' } })

    expect(newCatInput).toHaveValue('Development/Frontend')
  })

  it('setParentCategory appends trailing slash when leaf is empty', () => {
    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Development', 'Documentation']}
        onClose={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('New'))
    const newCatInput = screen.getByPlaceholderText('Category/Subcategory')

    // Leave newCategory empty then pick a parent
    const parentSelect = screen.getByDisplayValue('Parent…')
    fireEvent.change(parentSelect, { target: { value: 'Development' } })

    expect(newCatInput).toHaveValue('Development/')
  })

  it('setParentCategory replaces existing parent while keeping leaf', () => {
    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Development', 'Documentation']}
        onClose={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('New'))
    const newCatInput = screen.getByPlaceholderText('Category/Subcategory')
    fireEvent.change(newCatInput, { target: { value: 'OldParent/React' } })

    const parentSelect = screen.getByDisplayValue('Parent…')
    fireEvent.change(parentSelect, { target: { value: 'Development' } })

    expect(newCatInput).toHaveValue('Development/React')
  })

  it('ignores parent category select when value is empty', () => {
    render(<BookmarkDialog bookmark={null} categories={['Development']} onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('New'))
    const newCatInput = screen.getByPlaceholderText('Category/Subcategory')
    fireEvent.change(newCatInput, { target: { value: 'MyCategory' } })

    // Select the empty "Parent…" option
    const parentSelect = screen.getByDisplayValue('Parent…')
    fireEvent.change(parentSelect, { target: { value: '' } })

    expect(newCatInput).toHaveValue('MyCategory')
  })

  it('submits with a new category', async () => {
    const onClose = vi.fn()
    mockCreate.mockResolvedValue(undefined)

    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('My Bookmark'), {
      target: { value: 'Test' },
    })

    fireEvent.click(screen.getByText('New'))
    fireEvent.change(screen.getByPlaceholderText('Category/Subcategory'), {
      target: { value: 'NewCat/Sub' },
    })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ category: 'NewCat/Sub' }))
    })
  })

  it('trims URL with leading/trailing spaces before validation', async () => {
    const onClose = vi.fn()
    mockCreate.mockResolvedValue(undefined)

    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: '  https://example.com  ' },
    })
    fireEvent.change(screen.getByPlaceholderText('My Bookmark'), {
      target: { value: 'Test' },
    })
    fireEvent.change(screen.getByDisplayValue('Select category…'), {
      target: { value: 'Documentation' },
    })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com' })
      )
    })
  })

  it('filters empty strings from tags with trailing/double commas', async () => {
    const onClose = vi.fn()
    mockCreate.mockResolvedValue(undefined)

    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('My Bookmark'), {
      target: { value: 'Test' },
    })
    fireEvent.change(screen.getByDisplayValue('Select category…'), {
      target: { value: 'Documentation' },
    })
    fireEvent.change(screen.getByPlaceholderText('tag1, tag2, tag3'), {
      target: { value: 'react,,hooks, ,trailing,' },
    })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['react', 'hooks', 'trailing'] })
      )
    })
  })

  it('omits tags and description when empty on submit', async () => {
    mockCreate.mockResolvedValue(undefined)

    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('My Bookmark'), {
      target: { value: 'Test' },
    })
    fireEvent.change(screen.getByDisplayValue('Select category…'), {
      target: { value: 'Documentation' },
    })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: undefined,
          tags: undefined,
        })
      )
    })
  })

  it('shows generic error when non-Error is thrown on create', async () => {
    mockCreate.mockRejectedValue('string error')

    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('My Bookmark'), {
      target: { value: 'Test' },
    })
    fireEvent.change(screen.getByDisplayValue('Select category…'), {
      target: { value: 'Documentation' },
    })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('Failed to save bookmark')).toBeInTheDocument()
    })
  })

  it('shows category input (not select) in edit mode', () => {
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm-1',
            url: 'https://example.com',
            title: 'Edit Me',
            category: 'Dev Tools',
          } as never
        }
        categories={['Dev Tools', 'Documentation']}
        onClose={vi.fn()}
      />
    )

    // In edit mode the category is an editable input, not a select
    const catInput = screen.getByDisplayValue('Dev Tools') as HTMLInputElement
    expect(catInput.tagName).toBe('INPUT')
    expect(catInput.type).toBe('text')
  })

  it('populates fields from existing bookmark with tags', () => {
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm-1',
            url: 'https://example.com',
            title: 'Tagged Bookmark',
            description: 'Some description',
            category: 'Dev Tools',
            tags: ['react', 'typescript'],
          } as never
        }
        categories={['Dev Tools']}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Tagged Bookmark')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Some description')).toBeInTheDocument()
    expect(screen.getByDisplayValue('react, typescript')).toBeInTheDocument()
  })

  it('shows error when update fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'))

    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm-1',
            url: 'https://example.com',
            title: 'Edit Me',
            category: 'Dev Tools',
          } as never
        }
        categories={['Dev Tools']}
        onClose={vi.fn()}
      />
    )

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })
  })

  it('does not run AI suggestions in edit mode', async () => {
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm-1',
            url: 'https://example.com',
            title: 'Edit Me',
            category: 'Dev Tools',
          } as never
        }
        categories={['Dev Tools']}
        onClose={vi.fn()}
      />
    )

    // Wait a tick to ensure no async calls happen
    await new Promise(r => setTimeout(r, 50))
    expect(mockFetchPageTitle).not.toHaveBeenCalled()
    expect(mockQuickPrompt).not.toHaveBeenCalled()
  })

  it('handles AI returning JSON wrapped in markdown code fences', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Title' })
    mockQuickPrompt.mockResolvedValue(
      '```json\n{"description": "Fenced desc", "tags": ["fenced"]}\n```'
    )

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('Fenced desc')).toBeInTheDocument()
      expect(screen.getByDisplayValue('fenced')).toBeInTheDocument()
    })
  })

  it('displays the dialog title as "Add Bookmark" in create mode', () => {
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Add Bookmark' })).toBeInTheDocument()
  })

  it('displays the dialog title as "Edit Bookmark" in edit mode', () => {
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm-1',
            url: 'https://example.com',
            title: 'Edit Me',
            category: 'Dev Tools',
          } as never
        }
        categories={['Dev Tools']}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Edit Bookmark')).toBeInTheDocument()
  })

  it('renders hierarchical category options with indentation', () => {
    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Development', 'Development/Frontend', 'Development/Backend']}
        onClose={vi.fn()}
      />
    )

    const select = screen.getByDisplayValue('Select category…')
    const options = select.querySelectorAll('option')
    // "Select category…" + 3 categories
    expect(options.length).toBe(4)
    // Sub-categories should be indented (contain non-breaking spaces)
    expect(options[2].textContent).toContain('\u00A0\u00A0Frontend')
  })

  it('closes dialog via Cancel button', () => {
    const onClose = vi.fn()
    render(<BookmarkDialog bookmark={null} categories={['Documentation']} onClose={onClose} />)

    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('dispatches titleFetch:cancel when URL changes during fetch', async () => {
    mockFetchPageTitle.mockReturnValue(new Promise(() => {}))
    mockQuickPrompt.mockResolvedValue('{}')

    render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    expect(mockFetchPageTitle).toHaveBeenCalledWith('https://example.com')

    // Change URL → triggers effect re-run → old cleanup dispatches titleFetch:cancel
    const urlInput = screen.getByDisplayValue('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'https://other.com' } })

    // titleFetch:cancel sets fetchingTitle: false, so the indicator should disappear
    await waitFor(() => {
      expect(screen.queryByText('(fetching…)')).not.toBeInTheDocument()
    })
  })

  it('cancelled flag prevents state update when title fetch resolves after unmount', async () => {
    let resolveFetch!: (v: { success: boolean; title?: string }) => void
    mockFetchPageTitle.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )
    mockQuickPrompt.mockResolvedValue('{}')

    const { unmount } = render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    expect(mockFetchPageTitle).toHaveBeenCalledWith('https://example.com')

    // Unmount triggers cleanup → cancelled = true
    unmount()

    // Resolve fetch after unmount — cancelled flag prevents state update
    resolveFetch({ success: true, title: 'Late Title' })
    await new Promise(r => setTimeout(r, 0))
  })

  it('includes tags when updating an existing bookmark', async () => {
    const onClose = vi.fn()
    mockUpdate.mockResolvedValue(undefined)
    render(
      <BookmarkDialog
        bookmark={
          {
            _id: 'bm-1',
            url: 'https://example.com',
            title: 'Edit Me',
            category: 'Dev Tools',
            tags: ['existing', 'tag'],
          } as never
        }
        categories={['Dev Tools']}
        onClose={onClose}
      />
    )

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['existing', 'tag'],
        })
      )
    })
  })

  it('handles unmount during AI suggestion gracefully', async () => {
    mockFetchPageTitle.mockResolvedValue({ success: true, title: 'Title' })
    let resolveAI!: (v: string) => void
    mockQuickPrompt.mockReturnValue(
      new Promise(resolve => {
        resolveAI = resolve
      })
    )

    const { unmount } = render(
      <BookmarkDialog
        bookmark={null}
        categories={['Documentation']}
        initialUrl="https://example.com"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockQuickPrompt).toHaveBeenCalled()
    })

    // Unmount during AI call — triggers AI cleanup
    unmount()

    // Resolve AI after unmount — cancelled flag prevents state update
    resolveAI(JSON.stringify({ description: 'Late desc', tags: ['late'] }))
    await new Promise(r => setTimeout(r, 0))
  })
})
