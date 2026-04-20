import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ---------- module mocks (must precede the component import) ---------- */

vi.mock('./FilePreview.css', () => ({}))

vi.mock('lucide-react', () => ({
  FileText: (props: Record<string, unknown>) => <span data-testid="icon-file-text" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => (
    <span data-testid="icon-alert-circle" {...props} />
  ),
}))

const mockCodeToHtml = vi.fn<(code: string, opts: Record<string, unknown>) => Promise<string>>()
vi.mock('shiki', () => ({
  codeToHtml: (...args: unknown[]) =>
    mockCodeToHtml(...(args as [string, Record<string, unknown>])),
}))

/* ---------- component under test ---------- */

import { FilePreview } from './FilePreview'

/* ---------- window.filesystem stub ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- injected at runtime
const win = window as any

function installFilesystem(
  readFile: (
    path: string
  ) => Promise<{ content: string; language: string; size: number; error?: string }>
) {
  win.filesystem = { readFile: vi.fn(readFile) }
}

/* ---------- helpers re-exported from the module for unit tests ---------- */

// The helpers are not exported so we test them through the component's rendered
// output (formatFileSize, getFileName, lineCount, gutterWidth).
// We also exercise the reducer through component states.

/* ======================================================================== */

afterEach(() => {
  cleanup()
  mockCodeToHtml.mockReset()
  vi.restoreAllMocks()
  delete win.filesystem
})

/* ------------------------------------------------------------------ */
/*  Pure-function behaviour tested via rendered output                 */
/* ------------------------------------------------------------------ */

describe('formatFileSize (via rendered metadata)', () => {
  beforeEach(() => {
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>x</code></pre>')
  })

  it('renders bytes when size < 1024', async () => {
    installFilesystem(async () => ({ content: 'a', language: 'text', size: 512 }))
    render(<FilePreview filePath="C:\\file.txt" />)
    await waitFor(() => expect(screen.getByText(/512 B/)).toBeInTheDocument())
  })

  it('renders KB when size >= 1024 and < 1 MB', async () => {
    installFilesystem(async () => ({ content: 'a', language: 'text', size: 2048 }))
    render(<FilePreview filePath="C:\\file.txt" />)
    await waitFor(() => expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument())
  })

  it('renders MB when size >= 1 MB', async () => {
    installFilesystem(async () => ({ content: 'a', language: 'text', size: 2 * 1024 * 1024 }))
    render(<FilePreview filePath="C:\\file.txt" />)
    await waitFor(() => expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument())
  })
})

describe('getFileName (via rendered filename)', () => {
  beforeEach(() => {
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>x</code></pre>')
  })

  it('extracts filename from forward-slash path', async () => {
    installFilesystem(async () => ({ content: 'a', language: 'text', size: 1 }))
    render(<FilePreview filePath="home/user/readme.md" />)
    await waitFor(() => expect(screen.getByText('readme.md')).toBeInTheDocument())
  })

  it('extracts filename from backslash path', async () => {
    installFilesystem(async () => ({ content: 'a', language: 'text', size: 1 }))
    render(<FilePreview filePath="C:\\Users\\readme.md" />)
    await waitFor(() => expect(screen.getByText('readme.md')).toBeInTheDocument())
  })

  it('returns full string when no slashes', async () => {
    installFilesystem(async () => ({ content: 'a', language: 'text', size: 1 }))
    render(<FilePreview filePath="standalone.txt" />)
    await waitFor(() => expect(screen.getByText('standalone.txt')).toBeInTheDocument())
  })
})

/* ------------------------------------------------------------------ */
/*  toShikiLang — tested through mock codeToHtml call args             */
/* ------------------------------------------------------------------ */

describe('toShikiLang', () => {
  it('maps a known language via LANG_MAP (shell → shellscript)', async () => {
    installFilesystem(async () => ({ content: 'echo hi', language: 'shell', size: 7 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>echo hi</code></pre>')

    render(<FilePreview filePath="C:\\run.sh" />)
    await waitFor(() =>
      expect(mockCodeToHtml).toHaveBeenCalledWith('echo hi', {
        lang: 'shellscript',
        theme: 'dark-plus',
      })
    )
  })

  it('passes unmapped languages through as-is', async () => {
    installFilesystem(async () => ({ content: 'fn main', language: 'rust', size: 7 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>fn main</code></pre>')

    render(<FilePreview filePath="C:\\main.rs" />)
    await waitFor(() =>
      expect(mockCodeToHtml).toHaveBeenCalledWith('fn main', {
        lang: 'rust',
        theme: 'dark-plus',
      })
    )
  })
})

/* ------------------------------------------------------------------ */
/*  filePreviewReducer — tested through component state transitions    */
/* ------------------------------------------------------------------ */

describe('filePreviewReducer', () => {
  it('load-start: shows loading state', () => {
    installFilesystem(() => new Promise(() => {})) // never resolves
    render(<FilePreview filePath="C:\\pending.txt" />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('load-success: renders file content', async () => {
    installFilesystem(async () => ({ content: 'hello', language: 'text', size: 5 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>hello</code></pre>')

    render(<FilePreview filePath="C:\\ok.txt" />)
    await waitFor(() => expect(screen.getByText('ok.txt')).toBeInTheDocument())
  })

  it('load-error: shows error when readFile rejects', async () => {
    installFilesystem(() => Promise.reject(new Error('disk failure')))
    render(<FilePreview filePath="C:\\bad.txt" />)
    await waitFor(() => expect(screen.getByText('Failed to load file')).toBeInTheDocument())
  })

  it('load-error via error field in response: shows error message', async () => {
    installFilesystem(async () => ({
      content: '',
      language: 'plaintext',
      size: 0,
      error: 'Permission denied',
    }))
    render(<FilePreview filePath="C:\\denied.txt" />)
    await waitFor(() => expect(screen.getByText('Permission denied')).toBeInTheDocument())
  })

  it('set-highlight: highlighted HTML is injected into DOM', async () => {
    installFilesystem(async () => ({ content: 'code', language: 'javascript', size: 4 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>code</code></pre>')

    const { container } = render(<FilePreview filePath="C:\\test.js" />)
    await waitFor(() => {
      const el = container.querySelector('.file-preview-content')
      expect(el?.innerHTML).toContain('class="shiki')
    })
  })

  it('default: unknown action type preserves state (covered by re-render with same props)', async () => {
    installFilesystem(async () => ({ content: 'x', language: 'text', size: 1 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>x</code></pre>')

    const { rerender } = render(<FilePreview filePath="C:\\a.txt" />)
    await waitFor(() => expect(screen.getByText('a.txt')).toBeInTheDocument())

    // Re-render with same filePath — state should remain unchanged
    rerender(<FilePreview filePath="C:\\a.txt" />)
    expect(screen.getByText('a.txt')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/*  FilePreview component — integration tests                         */
/* ------------------------------------------------------------------ */

describe('FilePreview component', () => {
  it('shows loading indicator on initial render', () => {
    installFilesystem(() => new Promise(() => {}))
    render(<FilePreview filePath="C:\\file.txt" />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows error state when readFile rejects', async () => {
    installFilesystem(() => Promise.reject(new Error('boom')))
    render(<FilePreview filePath="C:\\fail.txt" />)
    await waitFor(() => {
      expect(screen.getByTestId('icon-alert-circle')).toBeInTheDocument()
      expect(screen.getByText('Failed to load file')).toBeInTheDocument()
    })
  })

  it('shows error state when readFile returns error in data', async () => {
    installFilesystem(async () => ({
      content: '',
      language: 'plaintext',
      size: 0,
      error: 'Not found',
    }))
    render(<FilePreview filePath="C:\\missing.txt" />)
    await waitFor(() => expect(screen.getByText('Not found')).toBeInTheDocument())
  })

  it('renders success state with file metadata', async () => {
    installFilesystem(async () => ({
      content: 'line1\nline2\nline3',
      language: 'typescript',
      size: 1536,
    }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>...</code></pre>')

    render(<FilePreview filePath="C:\\app.ts" />)
    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
      expect(screen.getByText(/typescript/)).toBeInTheDocument()
      expect(screen.getByText(/3 lines/)).toBeInTheDocument()
      expect(screen.getByText(/1\.5 KB/)).toBeInTheDocument()
    })
  })

  it('displays "1 line" (singular) for single-line content', async () => {
    installFilesystem(async () => ({ content: 'only', language: 'text', size: 4 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>only</code></pre>')

    render(<FilePreview filePath="C:\\one.txt" />)
    await waitFor(() => expect(screen.getByText(/1 line(?!s)/)).toBeInTheDocument())
  })

  it('sets gutter width CSS custom property', async () => {
    // 100 lines → 3 digits → gutterWidth = "4ch"
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
    installFilesystem(async () => ({ content: lines, language: 'text', size: lines.length }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>...</code></pre>')

    const { container } = render(<FilePreview filePath="C:\\big.txt" />)
    await waitFor(() => {
      const el = container.querySelector('.file-preview-content') as HTMLElement
      expect(el.style.getPropertyValue('--line-number-width')).toBe('4ch')
    })
  })

  /* ------ Shiki highlighting paths ------ */

  it('sets innerHTML when codeToHtml returns valid shiki HTML', async () => {
    installFilesystem(async () => ({ content: 'x = 1', language: 'python', size: 5 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>x = 1</code></pre>')

    const { container } = render(<FilePreview filePath="C:\\a.py" />)
    await waitFor(() => {
      const el = container.querySelector('.file-preview-content')
      expect(el?.innerHTML).toContain('class="shiki')
    })
  })

  it('does NOT set innerHTML when shiki output lacks class="shiki"', async () => {
    installFilesystem(async () => ({ content: 'bad', language: 'text', size: 3 }))
    mockCodeToHtml.mockResolvedValue('<pre><code>bad</code></pre>')

    const { container } = render(<FilePreview filePath="C:\\b.txt" />)
    // Wait for the effect to run — the content div should stay empty because
    // the sanity check rejects HTML without 'class="shiki'.
    await waitFor(() => {
      const el = container.querySelector('.file-preview-content')
      expect(el).toBeInTheDocument()
    })
    // Give effects time to settle
    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })
    const el = container.querySelector('.file-preview-content')
    expect(el?.innerHTML).toBe('')
  })

  it('falls back to lang "text" when first codeToHtml rejects', async () => {
    installFilesystem(async () => ({ content: 'data', language: 'unknown-lang', size: 4 }))
    mockCodeToHtml
      .mockRejectedValueOnce(new Error('unsupported lang'))
      .mockResolvedValueOnce('<pre class="shiki dark-plus"><code>data</code></pre>')

    const { container } = render(<FilePreview filePath="C:\\data.xyz" />)
    await waitFor(() => {
      expect(mockCodeToHtml).toHaveBeenCalledTimes(2)
      expect(mockCodeToHtml).toHaveBeenLastCalledWith('data', { lang: 'text', theme: 'dark-plus' })
    })
    await waitFor(() => {
      const el = container.querySelector('.file-preview-content')
      expect(el?.innerHTML).toContain('class="shiki')
    })
  })

  it('dispatches empty HTML when both codeToHtml calls reject', async () => {
    installFilesystem(async () => ({ content: 'fail', language: 'bad', size: 4 }))
    mockCodeToHtml
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))

    const { container } = render(<FilePreview filePath="C:\\fail.bad" />)
    await waitFor(() => expect(mockCodeToHtml).toHaveBeenCalledTimes(2))
    // After double failure the content div should have empty innerHTML
    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })
    const el = container.querySelector('.file-preview-content')
    expect(el?.innerHTML).toBe('')
  })

  it('dispatches empty highlight for empty content', async () => {
    installFilesystem(async () => ({ content: '', language: 'text', size: 0 }))

    const { container } = render(<FilePreview filePath="C:\\empty.txt" />)
    // With empty content, codeToHtml should NOT be called
    await waitFor(() => expect(screen.getByText('empty.txt')).toBeInTheDocument())
    expect(mockCodeToHtml).not.toHaveBeenCalled()
    // content div should have empty innerHTML
    const el = container.querySelector('.file-preview-content')
    expect(el?.innerHTML).toBe('')
  })

  /* ------ useLayoutEffect & filePath changes ------ */

  it('skips layout-effect reset when filePath is empty', async () => {
    installFilesystem(async () => ({ content: 'x', language: 'text', size: 1 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>x</code></pre>')

    render(<FilePreview filePath="" />)
    // With empty filePath, readFile should not be called and loading should show
    // (initial state is loading: true, but useLayoutEffect skips dispatch for empty path)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    // readFile should not have been called
    expect(win.filesystem.readFile).not.toHaveBeenCalled()
  })

  it('resets to loading state when filePath changes', async () => {
    const readFile =
      vi.fn<(p: string) => Promise<{ content: string; language: string; size: number }>>()
    let resolveFirst!: (v: { content: string; language: string; size: number }) => void
    let resolveSecond!: (v: { content: string; language: string; size: number }) => void

    readFile
      .mockReturnValueOnce(
        new Promise(r => {
          resolveFirst = r
        })
      )
      .mockReturnValueOnce(
        new Promise(r => {
          resolveSecond = r
        })
      )

    win.filesystem = { readFile }
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>...</code></pre>')

    const { rerender } = render(<FilePreview filePath="C:\\first.txt" />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    // Resolve first file
    await act(async () => {
      resolveFirst({ content: 'first', language: 'text', size: 5 })
    })
    await waitFor(() => expect(screen.getByText('first.txt')).toBeInTheDocument())

    // Change filePath — should reset to loading
    rerender(<FilePreview filePath="C:\\second.txt" />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    // Resolve second
    await act(async () => {
      resolveSecond({ content: 'second', language: 'text', size: 6 })
    })
    await waitFor(() => expect(screen.getByText('second.txt')).toBeInTheDocument())
  })

  it('ignores stale result when filePath changes before load completes', async () => {
    let resolveStale!: (v: { content: string; language: string; size: number }) => void
    const readFile =
      vi.fn<(p: string) => Promise<{ content: string; language: string; size: number }>>()

    readFile
      .mockReturnValueOnce(
        new Promise(r => {
          resolveStale = r
        })
      )
      .mockReturnValueOnce(Promise.resolve({ content: 'new content', language: 'text', size: 11 }))

    win.filesystem = { readFile }
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>...</code></pre>')

    const { rerender } = render(<FilePreview filePath="C:\\old.txt" />)

    // Switch filePath before old resolves — old result should be cancelled
    rerender(<FilePreview filePath="C:\\new.txt" />)

    // Wait for new file to render
    await waitFor(() => expect(screen.getByText('new.txt')).toBeInTheDocument())

    // Now resolve the stale request — should be ignored
    await act(async () => {
      resolveStale({ content: 'stale', language: 'text', size: 5 })
    })

    // Still showing new file, not stale
    expect(screen.getByText('new.txt')).toBeInTheDocument()
    expect(screen.queryByText('old.txt')).not.toBeInTheDocument()
  })

  /* ------ Line count and gutter width edge cases ------ */

  it('lineCount is 0 when content is null (error state)', async () => {
    installFilesystem(() => Promise.reject(new Error('oops')))
    render(<FilePreview filePath="C:\\err.txt" />)
    await waitFor(() => expect(screen.getByText('Failed to load file')).toBeInTheDocument())
    // Error state does not render line count
    expect(screen.queryByText(/lines?/)).not.toBeInTheDocument()
  })

  it('gutter width defaults to minimum 3ch for small line counts', async () => {
    installFilesystem(async () => ({ content: 'a', language: 'text', size: 1 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>a</code></pre>')

    const { container } = render(<FilePreview filePath="C:\\tiny.txt" />)
    await waitFor(() => {
      const el = container.querySelector('.file-preview-content') as HTMLElement
      // 1 line → 1 digit → Math.max(2,1)=2 → 2+1=3 → "3ch"
      expect(el.style.getPropertyValue('--line-number-width')).toBe('3ch')
    })
  })

  /* ------ Icons ------ */

  it('renders FileText icon in success header', async () => {
    installFilesystem(async () => ({ content: 'x', language: 'text', size: 1 }))
    mockCodeToHtml.mockResolvedValue('<pre class="shiki dark-plus"><code>x</code></pre>')

    render(<FilePreview filePath="C:\\icon.txt" />)
    await waitFor(() => expect(screen.getByTestId('icon-file-text')).toBeInTheDocument())
  })

  it('renders AlertCircle icon in error state', async () => {
    installFilesystem(() => Promise.reject(new Error('err')))
    render(<FilePreview filePath="C:\\broken.txt" />)
    await waitFor(() => expect(screen.getByTestId('icon-alert-circle')).toBeInTheDocument())
  })

  /* ------ Shiki fallback path: first fails, text fallback lacks class="shiki" ------ */

  it('fallback "text" codeToHtml without class="shiki" leaves content empty', async () => {
    installFilesystem(async () => ({ content: 'x', language: 'weird', size: 1 }))
    mockCodeToHtml
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce('<pre><code>x</code></pre>') // missing class="shiki"

    const { container } = render(<FilePreview filePath="C:\\weird.txt" />)
    await waitFor(() => expect(mockCodeToHtml).toHaveBeenCalledTimes(2))
    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })
    const el = container.querySelector('.file-preview-content')
    expect(el?.innerHTML).toBe('')
  })
})
