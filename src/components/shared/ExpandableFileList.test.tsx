import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExpandableFileList } from './ExpandableFileList'
import type { DiffFile } from '../../api/github'

const mockFiles: DiffFile[] = [
  {
    filename: 'src/app.ts',
    previousFilename: null,
    status: 'modified',
    additions: 10,
    deletions: 3,
    changes: 13,
    patch: '@@ -1,5 +1,7 @@\n+import foo\n-import bar\n context line',
    blobUrl: 'https://github.com/test/repo/blob/abc/src/app.ts',
  },
  {
    filename: 'src/utils.ts',
    previousFilename: 'src/old-utils.ts',
    status: 'renamed',
    additions: 0,
    deletions: 0,
    changes: 0,
    patch: null,
    blobUrl: null,
  },
]

describe('ExpandableFileList', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      ...window,
      shell: { openExternal: vi.fn() },
    })
  })

  it('renders all files collapsed by default', () => {
    render(<ExpandableFileList files={mockFiles} resetKey="test-1" />)
    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
  })

  it('expands a file on click to show diff', () => {
    render(<ExpandableFileList files={mockFiles} resetKey="test-1" />)
    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.click(header)
    expect(screen.getByRole('presentation')).toBeInTheDocument()
    expect(screen.getByText('+import foo')).toBeInTheDocument()
  })

  it('expands a file on Enter key', () => {
    render(<ExpandableFileList files={mockFiles} resetKey="test-1" />)
    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: 'Enter' })
    expect(screen.getByRole('presentation')).toBeInTheDocument()
  })

  it('expands a file on Space key', () => {
    render(<ExpandableFileList files={mockFiles} resetKey="test-1" />)
    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.keyDown(header, { key: ' ' })
    expect(screen.getByRole('presentation')).toBeInTheDocument()
  })

  it('shows no-patch fallback message for files without patch', () => {
    render(<ExpandableFileList files={mockFiles} resetKey="test-1" />)
    const header = screen.getByText('src/utils.ts').closest('[role="button"]')!
    fireEvent.click(header)
    expect(screen.getByText(/did not provide a patch preview/)).toBeInTheDocument()
  })

  it('shows previous filename for renamed files', () => {
    render(<ExpandableFileList files={mockFiles} resetKey="test-1" />)
    expect(screen.getByText('from src/old-utils.ts')).toBeInTheDocument()
  })

  it('renders file stats', () => {
    render(<ExpandableFileList files={mockFiles} resetKey="test-1" />)
    expect(screen.getByText('+10')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument()
    expect(screen.getByText('13 changes')).toBeInTheDocument()
  })

  it('opens external URL on blob button click without toggling parent', () => {
    render(<ExpandableFileList files={mockFiles} resetKey="test-1" />)
    const openBtn = screen.getByTitle('Open file on GitHub')
    fireEvent.click(openBtn)
    expect(window.shell?.openExternal).toHaveBeenCalledWith(
      'https://github.com/test/repo/blob/abc/src/app.ts'
    )
    // File should NOT be expanded since the click was stopped
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
  })

  it('collapses all files when resetKey changes', () => {
    const { rerender } = render(<ExpandableFileList files={mockFiles} resetKey="key-1" />)
    const header = screen.getByText('src/app.ts').closest('[role="button"]')!
    fireEvent.click(header)
    expect(screen.getByRole('presentation')).toBeInTheDocument()

    rerender(<ExpandableFileList files={mockFiles} resetKey="key-2" />)
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
  })
})
