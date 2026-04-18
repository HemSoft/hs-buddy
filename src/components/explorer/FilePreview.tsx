import { useState, useEffect, useRef } from 'react'
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

export function FilePreview({ filePath }: FilePreviewProps) {
  const [data, setData] = useState<FileData | null>(null)
  const [loading, setLoading] = useState(true)
  const prevPathRef = useRef<string>('')
  const codeRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!filePath || filePath === prevPathRef.current) return
    prevPathRef.current = filePath

    let cancelled = false
    setLoading(true)
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

  const lines = data.content.split('\n')
  const lineCount = lines.length

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <FileText size={14} />
        <span className="file-preview-filename">{getFileName(filePath)}</span>
        <span className="file-preview-meta">
          {data.language} · {lineCount} lines · {formatFileSize(data.size)}
        </span>
      </div>
      <div className="file-preview-content">
        <pre ref={codeRef} className={`file-preview-code language-${data.language}`}>
          <code>
            {lines.map((line, i) => (
              <div key={i} className="file-preview-line">
                <span className="file-preview-line-number">{i + 1}</span>
                <span className="file-preview-line-content">{line || ' '}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}
