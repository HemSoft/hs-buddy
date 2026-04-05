import { useEffect, useRef, useState } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import remarkGemoji from 'remark-gemoji'
import {
  Sparkles,
  Clock,
  XCircle,
  Loader2,
  ExternalLink,
  Trash2,
  RotateCcw,
  Copy,
  MessageSquareShare,
} from 'lucide-react'
import { GitHubClient } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useCopilotResult, useCopilotResultMutations } from '../hooks/useConvex'
import { useExternalMarkdownLinks } from '../hooks/useExternalMarkdownLinks'
import { formatDateFull, formatDuration } from '../utils/dateUtils'
import { getStatusIcon, getStatusLabel } from './shared/statusDisplay'
import type { Id } from '../../convex/_generated/dataModel'
import './CopilotResultPanel.css'

interface CopilotResultPanelProps {
  resultId: string
}

export function CopilotResultPanel({ resultId }: CopilotResultPanelProps) {
  const result = useCopilotResult(resultId as Id<'copilotResults'>)
  const contentRef = useRef<HTMLDivElement>(null)
  useExternalMarkdownLinks(contentRef)
  const { remove } = useCopilotResultMutations()
  const { accounts } = useGitHubAccounts()
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current)
      }
    }
  }, [])

  if (result === undefined) {
    return (
      <div className="copilot-result-panel">
        <div className="copilot-result-loading">
          <Loader2 size={32} className="spin" />
          <p>Loading result...</p>
        </div>
      </div>
    )
  }

  if (result === null) {
    return (
      <div className="copilot-result-panel">
        <div className="copilot-result-error">
          <XCircle size={32} />
          <p>Result not found</p>
        </div>
      </div>
    )
  }

  const handleCopy = async () => {
    if (result.result) {
      await navigator.clipboard.writeText(result.result)
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRetry = async () => {
    try {
      await window.copilot.execute({
        prompt: result.prompt,
        category: result.category ?? undefined,
        metadata: result.metadata ?? undefined,
      })
    } catch (err) {
      console.error('Failed to retry prompt:', err)
    }
  }

  const handlePublishToPR = async () => {
    if (!result.result || publishing) return
    const meta = result.metadata as Record<string, unknown> | null
    const org = meta?.org as string | undefined
    const repo = meta?.repo as string | undefined
    const prNumber = meta?.prNumber as number | undefined
    if (!org || !repo || !prNumber) return

    setPublishing(true)
    try {
      const client = new GitHubClient({ accounts }, 7)
      const body = `## 🤖 AI Review\n\n${result.result}\n\n---\n*Published from HS Buddy — ${result.model || 'AI'} review*`
      await client.addPRComment(org, repo, prNumber, body)
      setPublished(true)
    } catch (err) {
      console.error('Failed to publish review to PR:', err)
    } finally {
      setPublishing(false)
    }
  }

  const metadata = result.metadata as Record<string, unknown> | null
  const canPublish =
    result.category === 'pr-review' &&
    result.status === 'completed' &&
    !!result.result &&
    !!metadata?.org &&
    !!metadata?.repo &&
    !!metadata?.prNumber

  return (
    <div className="copilot-result-panel">
      {/* Header */}
      <div className="copilot-result-header">
        <div className="copilot-result-header-left">
          <Sparkles size={20} className="copilot-header-icon" />
          <div className="copilot-result-title-info">
            <h2>
              {result.category === 'pr-review' && metadata?.prTitle
                ? `PR Review: ${metadata.prTitle as string}`
                : 'Copilot Result'}
            </h2>
            <div className="copilot-result-meta">
              <span className="copilot-result-status">
                {getStatusIcon(result.status, 16, 'status')}
                {getStatusLabel(result.status, true)}
              </span>
              {result.model && <span className="copilot-result-model">{result.model}</span>}
              <span className="copilot-result-date">{formatDateFull(result.createdAt)}</span>
              {result.duration && (
                <span className="copilot-result-duration">{formatDuration(result.duration)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="copilot-result-header-actions">
          {result.category === 'pr-review' && !!metadata?.prUrl && (
            <button
              className="copilot-action-btn"
              onClick={() => window.shell.openExternal(metadata.prUrl as string)}
              title="Open PR on GitHub"
            >
              <ExternalLink size={14} />
            </button>
          )}
          {canPublish && (
            <button
              className={`copilot-action-btn${published ? ' success' : ''}`}
              onClick={handlePublishToPR}
              disabled={publishing || published}
              title={published ? 'Published to PR' : 'Publish review as PR comment'}
            >
              {publishing ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <MessageSquareShare size={14} />
              )}
              {published && <span className="copied-badge">✓</span>}
            </button>
          )}
          {result.result && (
            <button
              className="copilot-action-btn"
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy markdown'}
            >
              <Copy size={14} />
              {copied && <span className="copied-badge">✓</span>}
            </button>
          )}
          <button className="copilot-action-btn" onClick={handleRetry} title="Re-run this prompt">
            <RotateCcw size={14} />
          </button>
          <button
            className="copilot-action-btn danger"
            onClick={() => remove({ id: result._id })}
            title="Delete result"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Prompt */}
      <div className="copilot-result-prompt">
        <span className="prompt-label">Prompt</span>
        <p>{result.prompt}</p>
      </div>

      {/* Content */}
      <div ref={contentRef} className="copilot-result-content">
        {result.status === 'pending' && (
          <div className="copilot-result-waiting">
            <Clock size={48} />
            <p>Waiting to start...</p>
            <p className="waiting-subtitle">The Copilot SDK session will begin shortly.</p>
          </div>
        )}

        {result.status === 'running' && (
          <div className="copilot-result-waiting">
            <Loader2 size={48} className="spin" />
            <p>Copilot is working...</p>
            <p className="waiting-subtitle">
              Analyzing and generating response. This may take a minute.
            </p>
          </div>
        )}

        {result.status === 'completed' && result.result && (
          <div className="copilot-result-markdown" data-color-mode="dark">
            <MarkdownPreview
              source={result.result}
              remarkPlugins={[remarkGemoji]}
              style={{ backgroundColor: 'transparent', color: 'var(--text-primary)' }}
            />
          </div>
        )}

        {result.status === 'failed' && (
          <div className="copilot-result-failed">
            <XCircle size={48} />
            <p>Prompt execution failed</p>
            {result.error && <pre className="error-detail">{result.error}</pre>}
            <button className="retry-btn" onClick={handleRetry}>
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
