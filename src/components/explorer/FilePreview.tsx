import { useState, useEffect, useRef, useMemo } from 'react'
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileName(filePath: string): string {
  const parts = filePath.replace(/\//g, '\\').split('\\')
  return parts[parts.length - 1] || filePath
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
  const [data, setData] = useState<FileData | null>(null)
  const [highlightedHtml, setHighlightedHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)

  // Load the file
  useEffect(() => {
    if (!filePath) return

    let cancelled = false
    setLoading(true)
    setData(null)
    setHighlightedHtml('')
    window.filesystem
      .readFile(filePath)
      .then(result => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData({ content: '', language: 'plaintext', size: 0, error: 'Failed to load file' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filePath])

  // Highlight with Shiki once content is loaded
  useEffect(() => {
    if (!data?.content || data.error) return
    if (data.content === '') {
      setHighlightedHtml('')
      return
    }

    const content = data.content
    const language = data.language
    let cancelled = false

    codeToHtml(content, {
      lang: toShikiLang(language),
      theme: 'dark-plus',
    })
      .then(html => {
        if (!cancelled && html.includes('class="shiki')) setHighlightedHtml(html)
      })
      .catch(() => {
        if (!cancelled) {
          codeToHtml(content, { lang: 'text', theme: 'dark-plus' })
            .then(html => { if (!cancelled && html.includes('class="shiki')) setHighlightedHtml(html) })
            .catch(() => { if (!cancelled) setHighlightedHtml('') })
        }
      })
    return () => { cancelled = true }
  }, [data])

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

  if (!data || data.error) {
    return (
      <div className="file-preview">
        <div className="file-preview-header">
          <FileText size={14} />
          <span className="file-preview-filename">{getFileName(filePath)}</span>
        </div>
        <div className="file-preview-error">
          <AlertCircle size={16} />
          <span>{data?.error || 'Failed to load file'}</span>
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
          {data.language} · {lineCount} {lineCount === 1 ? 'line' : 'lines'} · {formatFileSize(data.size)}
        </span>
      </div>
      <div
        ref={contentRef}
        className="file-preview-content shiki-container"
        style={{ '--line-number-width': gutterWidth } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </div>
  )
}
