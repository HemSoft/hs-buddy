import { useEffect, useRef, useState } from 'react'
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
import { MarkdownContent } from './shared/MarkdownContent'
import type { Id } from '../../convex/_generated/dataModel'
import './CopilotResultPanel.css'

interface CopilotResultPanelProps {
  resultId: string
}

function canPublishToPR(
  result: NonNullable<ReturnType<typeof useCopilotResult>>,
  metadata: Record<string, unknown> | null
): boolean {
  return (
    result.category === 'pr-review' &&
    result.status === 'completed' &&
    !!result.result &&
    extractPRMetadata(metadata) !== null
  )
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0
}

function extractPRMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return null
  const { org, repo, prNumber } = metadata
  if (
    !isNonEmptyString(org) ||
    !isNonEmptyString(repo) ||
    typeof prNumber !== 'number' ||
    !Number.isInteger(prNumber) ||
    prNumber <= 0
  )
    return null
  return { org, repo, prNumber }
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

  const metadata = result.metadata as Record<string, unknown> | null

  const handleCopy = async () => {
    /* v8 ignore start */
    if (result.result) {
      /* v8 ignore stop */
      await navigator.clipboard.writeText(result.result)
      setCopied(true)
      /* v8 ignore start */
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      /* v8 ignore stop */
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
    const prMeta = extractPRMetadata(metadata)
    if (!prMeta) return

    setPublishing(true)
    try {
      const client = new GitHubClient({ accounts }, 7)
      /* v8 ignore start */
      const body = `## 🤖 AI Review\n\n${result.result}\n\n---\n*Published from HS Buddy — ${result.model || 'AI'} review*`
      /* v8 ignore stop */
      await client.addPRComment(prMeta.org, prMeta.repo, prMeta.prNumber, body)
      setPublished(true)
    } catch (err) {
      console.error('Failed to publish review to PR:', err)
    } finally {
      setPublishing(false)
    }
  }

  const canPublish = canPublishToPR(result, metadata)

  return (
    <div className="copilot-result-panel">
      <ResultHeader
        result={result}
        metadata={metadata}
        canPublish={canPublish}
        copied={copied}
        publishing={publishing}
        published={published}
        onCopy={handleCopy}
        onRetry={handleRetry}
        onPublish={handlePublishToPR}
        onDelete={() => remove({ id: result._id })}
      />

      {/* Prompt */}
      <div className="copilot-result-prompt">
        <span className="prompt-label">Prompt</span>
        <p>{result.prompt}</p>
      </div>

      {/* Content */}
      <ResultContent
        contentRef={contentRef}
        status={result.status}
        resultText={result.result}
        error={result.error}
        onRetry={handleRetry}
      />
    </div>
  )
}

function ResultHeader({
  result,
  metadata,
  canPublish,
  copied,
  publishing,
  published,
  onCopy,
  onRetry,
  onPublish,
  onDelete,
}: {
  result: NonNullable<ReturnType<typeof useCopilotResult>>
  metadata: Record<string, unknown> | null
  canPublish: boolean
  copied: boolean
  publishing: boolean
  published: boolean
  onCopy: () => void
  onRetry: () => void
  onPublish: () => void
  onDelete: () => void
}) {
  return (
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
      <ResultActions
        result={result}
        metadata={metadata}
        canPublish={canPublish}
        copied={copied}
        publishing={publishing}
        published={published}
        onCopy={onCopy}
        onRetry={onRetry}
        onPublish={onPublish}
        onDelete={onDelete}
      />
    </div>
  )
}

function PublishButton({
  canPublish,
  published,
  publishing,
  onPublish,
}: {
  canPublish: boolean
  published: boolean
  publishing: boolean
  onPublish: () => void
}) {
  if (!canPublish) return null
  return (
    <button
      className={`copilot-action-btn${published ? ' success' : ''}`}
      onClick={onPublish}
      disabled={publishing || published}
      title={published ? 'Published to PR' : 'Publish review as PR comment'}
    >
      {publishing ? <Loader2 size={14} className="spin" /> : <MessageSquareShare size={14} />}
      {published && <span className="copied-badge">✓</span>}
    </button>
  )
}

function CopyActionButton({
  hasResult,
  copied,
  onCopy,
}: {
  hasResult: boolean
  copied: boolean
  onCopy: () => void
}) {
  if (!hasResult) return null
  return (
    <button
      className="copilot-action-btn"
      onClick={onCopy}
      title={copied ? 'Copied!' : 'Copy markdown'}
    >
      <Copy size={14} />
      {copied && <span className="copied-badge">✓</span>}
    </button>
  )
}

function ResultActions({
  result,
  metadata,
  canPublish,
  copied,
  publishing,
  published,
  onCopy,
  onRetry,
  onPublish,
  onDelete,
}: {
  result: NonNullable<ReturnType<typeof useCopilotResult>>
  metadata: Record<string, unknown> | null
  canPublish: boolean
  copied: boolean
  publishing: boolean
  published: boolean
  onCopy: () => void
  onRetry: () => void
  onPublish: () => void
  onDelete: () => void
}) {
  return (
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
      <PublishButton
        canPublish={canPublish}
        published={published}
        publishing={publishing}
        onPublish={onPublish}
      />
      <CopyActionButton hasResult={!!result.result} copied={copied} onCopy={onCopy} />
      <button className="copilot-action-btn" onClick={onRetry} title="Re-run this prompt">
        <RotateCcw size={14} />
      </button>
      <button className="copilot-action-btn danger" onClick={onDelete} title="Delete result">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function PendingContent() {
  return (
    <div className="copilot-result-waiting">
      <Clock size={48} />
      <p>Waiting to start...</p>
      <p className="waiting-subtitle">The Copilot SDK session will begin shortly.</p>
    </div>
  )
}

function RunningContent() {
  return (
    <div className="copilot-result-waiting">
      <Loader2 size={48} className="spin" />
      <p>Copilot is working...</p>
      <p className="waiting-subtitle">Analyzing and generating response. This may take a minute.</p>
    </div>
  )
}

function FailedContent({ error, onRetry }: { error?: string | null; onRetry: () => void }) {
  return (
    <div className="copilot-result-failed">
      <XCircle size={48} />
      <p>Prompt execution failed</p>
      {error && <pre className="error-detail">{error}</pre>}
      <button className="retry-btn" onClick={onRetry}>
        <RotateCcw size={14} />
        Retry
      </button>
    </div>
  )
}

function ResultContent({
  contentRef,
  status,
  resultText,
  error,
  onRetry,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>
  status: string
  resultText?: string | null
  error?: string | null
  onRetry: () => void
}) {
  return (
    <div ref={contentRef} className="copilot-result-content">
      {status === 'pending' && <PendingContent />}
      {status === 'running' && <RunningContent />}
      {status === 'completed' && resultText && (
        <MarkdownContent source={resultText} className="copilot-result-markdown" />
      )}
      {status === 'failed' && <FailedContent error={error} onRetry={onRetry} />}
    </div>
  )
}
