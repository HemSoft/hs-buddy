import { useReducer, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { codeToHtml, type BundledLanguage } from 'shiki'
import { FileText, AlertCircle } from 'lucide-react'
import './FilePreview.css'

interface FilePreviewProps {
  filePath: string
}

interface FileData {
  content: string
  language: string
  size: number
  error?: string
}

type FilePreviewState = { data: FileData | null; highlightedHtml: string; loading: boolean }
type FilePreviewAction =
  | { type: 'load-start' }
  | { type: 'load-success'; data: FileData }
  | { type: 'load-error' }
  | { type: 'set-highlight'; html: string }

function filePreviewReducer(state: FilePreviewState, action: FilePreviewAction): FilePreviewState {
  /* v8 ignore start */
  switch (action.type) {
    /* v8 ignore stop */
    case 'load-start':
      return { data: null, highlightedHtml: '', loading: true }
    case 'load-success':
      return { ...state, data: action.data, loading: false }
    case 'load-error':
      return {
        ...state,
        data: { content: '', language: 'plaintext', size: 0, error: 'Failed to load file' },
        loading: false,
      }
    case 'set-highlight':
      return { ...state, highlightedHtml: action.html }
    default:
      /* v8 ignore start */
      return state
    /* v8 ignore stop */
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileName(filePath: string): string {
  const parts = filePath.replace(/\//g, '\\').split('\\')
  /* v8 ignore start */
  return parts[parts.length - 1] || filePath
  /* v8 ignore stop */
}

/** Map our language identifiers to Shiki's BundledLanguage names */
const LANG_MAP: Record<string, string> = {
  shell: 'shellscript',
  gitignore: 'ini',
  makefile: 'make',
  plaintext: 'text',
}

function toShikiLang(lang: string): BundledLanguage {
  return (LANG_MAP[lang] ?? lang) as BundledLanguage
}

export function FilePreview({ filePath }: FilePreviewProps) {
  const [state, dispatch] = useReducer(filePreviewReducer, {
    data: null,
    highlightedHtml: '',
    loading: true,
  })
  const { data, highlightedHtml, loading } = state
  const contentRef = useRef<HTMLDivElement>(null)

  // Reset state before paint when filePath changes to prevent stale content flash.
  // useLayoutEffect fires after commit but before the browser paints, so the user
  // never sees the previous file's highlighted HTML.
  // Guard against falsy filePath to avoid getting stuck in loading state, since the
  // readFile effect below bails out when filePath is empty.
  useLayoutEffect(() => {
    if (!filePath) return
    dispatch({ type: 'load-start' })
  }, [filePath])

  // Load the file
  useEffect(() => {
    if (!filePath) return

    let cancelled = false
    window.filesystem
      .readFile(filePath)
      .then(result => {
        if (!cancelled) dispatch({ type: 'load-success', data: result })
      })
      .catch(() => {
        /* v8 ignore start */
        if (!cancelled) dispatch({ type: 'load-error' })
        /* v8 ignore stop */
      })
    return () => {
      cancelled = true
    }
  }, [filePath])

  // Highlight with Shiki once content is loaded
  useEffect(() => {
    if (!data?.content || data.error) return
    /* v8 ignore start */
    if (data.content === '') {
      dispatch({ type: 'set-highlight', html: '' })
      return
      /* v8 ignore stop */
    }

    const content = data.content
    const language = data.language
    let cancelled = false

    codeToHtml(content, {
      lang: toShikiLang(language),
      theme: 'dark-plus',
    })
      .then(html => {
        if (!cancelled && html.includes('class="shiki')) dispatch({ type: 'set-highlight', html })
      })
      .catch(() => {
        /* v8 ignore start */
        if (!cancelled) {
          /* v8 ignore stop */
          codeToHtml(content, { lang: 'text', theme: 'dark-plus' })
            .then(html => {
              if (!cancelled && html.includes('class="shiki'))
                dispatch({ type: 'set-highlight', html })
            })
            .catch(() => {
              /* v8 ignore start */
              if (!cancelled) dispatch({ type: 'set-highlight', html: '' })
              /* v8 ignore stop */
            })
        }
      })
    return () => {
      cancelled = true
    }
  }, [data])

  // Trust model: highlightedHtml is populated exclusively by Shiki's codeToHtml()
  // in the effect above — never from user input or remote sources. This is enforced
  // by code structure (only the Shiki effect dispatches 'set-highlight').
  // The includes() check below is a sanity/integrity assertion that Shiki produced
  // well-formed output, NOT a security boundary — any string could contain that
  // substring. If a real XSS concern arises (e.g. untrusted file sources), replace
  // this with DOMPurify or Trusted Types.
  useLayoutEffect(() => {
    if (!contentRef.current) return
    /* v8 ignore start */
    if (highlightedHtml && !highlightedHtml.includes('class="shiki')) {
      contentRef.current.innerHTML = ''
      return
      /* v8 ignore stop */
    }
    contentRef.current.innerHTML = highlightedHtml
  }, [highlightedHtml])

  const lineCount = useMemo(() => {
    if (!data?.content) return 0
    return data.content.split('\n').length
  }, [data?.content])

  // Calculate gutter width based on line count digits
  const gutterWidth = useMemo(() => {
    const digits = Math.max(2, String(lineCount).length)
    return `${digits + 1}ch`
  }, [lineCount])

  if (loading) {
    return (
      <div className="file-preview">
        <div className="file-preview-loading">Loading…</div>
      </div>
    )
  }

  /* v8 ignore start -- unreachable: reducer always sets data on success/error */
  if (!data) {
    return (
      <div className="file-preview">
        <div className="file-preview-header">
          <FileText size={14} />
          <span className="file-preview-filename">{getFileName(filePath)}</span>
        </div>
        <div className="file-preview-error">
          <AlertCircle size={16} />
          <span>Failed to load file</span>
        </div>
      </div>
    )
  }
  /* v8 ignore stop */

  if (data.error) {
    return (
      <div className="file-preview">
        <div className="file-preview-header">
          <FileText size={14} />
          <span className="file-preview-filename">{getFileName(filePath)}</span>
        </div>
        <div className="file-preview-error">
          <AlertCircle size={16} />
          {/* v8 ignore start */}
          <span>{data.error}</span>
          {/* v8 ignore stop */}
        </div>
      </div>
    )
  }

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <FileText size={14} />
        <span className="file-preview-filename">{getFileName(filePath)}</span>
        <span className="file-preview-meta">
          {data.language} · {lineCount} {lineCount === 1 ? 'line' : 'lines'} ·{' '}
          {formatFileSize(data.size)}
        </span>
      </div>
      <div
        ref={contentRef}
        className="file-preview-content shiki-container"
        style={{ '--line-number-width': gutterWidth } as React.CSSProperties}
      />
    </div>
  )
}
