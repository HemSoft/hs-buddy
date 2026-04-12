import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
})
