import { useCallback, useEffect, useRef, useState } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileCode,
  GitPullRequestArrow,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  RotateCcw,
  Send,
} from 'lucide-react'
import {
  GitHubClient,
  type PRCommentReactionContent,
  type PRReviewThread,
  type PRReviewComment,
  type PRThreadsResult,
} from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import type { PRDetailInfo } from '../utils/prDetailView'
import { formatDistanceToNow } from '../utils/dateUtils'
import './PRThreadsPanel.css'

interface PRThreadsPanelProps {
  pr: PRDetailInfo
}

const REACTION_OPTIONS: Array<{ content: PRCommentReactionContent; emoji: string; label: string }> = [
  { content: 'THUMBS_UP', emoji: '👍', label: 'Thumbs up' },
  { content: 'THUMBS_DOWN', emoji: '👎', label: 'Thumbs down' },
  { content: 'LAUGH', emoji: '😄', label: 'Laugh' },
  { content: 'HOORAY', emoji: '🎉', label: 'Hooray' },
  { content: 'CONFUSED', emoji: '😕', label: 'Confused' },
  { content: 'HEART', emoji: '❤️', label: 'Heart' },
  { content: 'ROCKET', emoji: '🚀', label: 'Rocket' },
  { content: 'EYES', emoji: '👀', label: 'Eyes' },
]

function parseOwnerRepoFromUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match || !match[1] || !match[2]) return null
  return { owner: match[1], repo: match[2] }
}

/**
 * Parse the @@ header to extract starting line numbers.
 * Format: @@ -oldStart[,oldCount] +newStart[,newCount] @@
 */
function parseHunkHeader(header: string): { oldStart: number; newStart: number } | null {
  const m = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (!m) return null
  return { oldStart: parseInt(m[1], 10), newStart: parseInt(m[2], 10) }
}

/**
 * Trim a diff hunk to show only the most relevant lines around the
 * commented position. The GitHub API returns the full hunk from the `@@`
 * header down to the commented line. When multiple threads share the same
 * hunk, showing all of it makes them look identical. Trimming to the last
 * MAX_CONTEXT lines (plus the `@@` header) keeps each thread's snippet
 * unique and focused.
 */
function trimDiffHunk(hunk: string): { lines: string[]; wasTrimmed: boolean; skipCount: number } {
  const MAX_CONTEXT = 6
  const allLines = hunk.split('\n').filter(l => l.length > 0)

  // Always keep the @@ header line if present
  const headerIdx = allLines.findIndex(l => l.startsWith('@@'))
  const headerLine = headerIdx >= 0 ? allLines[headerIdx] : null
  const contentLines = headerIdx >= 0 ? allLines.slice(headerIdx + 1) : allLines

  if (contentLines.length <= MAX_CONTEXT) {
    return { lines: allLines, wasTrimmed: false, skipCount: 0 }
  }

  // Keep only the last MAX_CONTEXT content lines (closest to the comment)
  const skipCount = contentLines.length - MAX_CONTEXT
  const trimmed = contentLines.slice(-MAX_CONTEXT)
  const result = headerLine ? [headerLine, ...trimmed] : trimmed
  return { lines: result, wasTrimmed: true, skipCount }
}

/** Render a diff hunk as styled code lines with line numbers */
function DiffHunk({ hunk }: { hunk: string }) {
  const { lines, wasTrimmed, skipCount } = trimDiffHunk(hunk)

  // Parse line numbers from the @@ header
  const headerLine = lines.find(l => l.startsWith('@@'))
  const parsed = headerLine ? parseHunkHeader(headerLine) : null
  let oldLine = parsed?.oldStart ?? 1
  let newLine = parsed?.newStart ?? 1

  // If we trimmed lines, advance the counters past skipped lines
  if (wasTrimmed && parsed) {
    const allContentLines = hunk.split('\n').filter(l => l.length > 0)
    const headerIdx = allContentLines.findIndex(l => l.startsWith('@@'))
    const skippedLines = allContentLines.slice(headerIdx + 1, headerIdx + 1 + skipCount)
    for (const sl of skippedLines) {
      if (sl.startsWith('+')) newLine++
      else if (sl.startsWith('-')) oldLine++
      else { oldLine++; newLine++ }
    }
  }

  return (
    <div className="diff-hunk">
      <div className="diff-hunk-lines">
        {wasTrimmed && (
          <div className="diff-line diff-truncated">
            <span className="diff-line-num" />
            <span className="diff-line-num" />
            <span className="diff-line-content">⋯</span>
          </div>
        )}
        {lines.map((line, i) => {
          let lineClass = 'diff-line'
          let leftNum: number | null = null
          let rightNum: number | null = null

          if (line.startsWith('@@')) {
            lineClass += ' diff-range'
          } else if (line.startsWith('+')) {
            lineClass += ' diff-add'
            rightNum = newLine++
          } else if (line.startsWith('-')) {
            lineClass += ' diff-del'
            leftNum = oldLine++
          } else {
            leftNum = oldLine++
            rightNum = newLine++
          }

          return (
            <div key={i} className={lineClass}>
              {!line.startsWith('@@') && (
                <>
                  <span className="diff-line-num">{leftNum ?? ''}</span>
                  <span className="diff-line-num">{rightNum ?? ''}</span>
                </>
              )}
              {line.startsWith('@@') && (
                <>
                  <span className="diff-line-num" />
                  <span className="diff-line-num" />
                </>
              )}
              <span className="diff-line-content">{line}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Parse a comment body to separate regular markdown from ```suggestion blocks.
 * Returns an array of segments: { type: 'text' | 'suggestion', content: string }
 */
function parseCommentBody(body: string | null | undefined): Array<{ type: 'text' | 'suggestion'; content: string }> {
  const segments: Array<{ type: 'text' | 'suggestion'; content: string }> = []
  const safeBody = body ?? ''
  const regex = /```suggestion\s*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(safeBody)) !== null) {
    // Text before the suggestion
    if (match.index > lastIndex) {
      const text = safeBody.slice(lastIndex, match.index).trim()
      if (text) segments.push({ type: 'text', content: text })
    }
    segments.push({ type: 'suggestion', content: match[1] })
    lastIndex = match.index + match[0].length
  }

  // Remaining text after last suggestion
  if (lastIndex < safeBody.length) {
    const text = safeBody.slice(lastIndex).trim()
    if (text) segments.push({ type: 'text', content: text })
  }

  // If no segments were found, treat the whole body as text
  if (segments.length === 0 && safeBody.trim()) {
    segments.push({ type: 'text', content: safeBody })
  }

  return segments
}

/** Render a GitHub-style "Suggested change" block */
function SuggestionBlock({ content }: { content: string }) {
  const lines = content.split('\n')
  // Remove trailing empty line if present
  if (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }

  return (
    <div className="suggestion-block">
      <div className="suggestion-header">
        <GitPullRequestArrow size={13} />
        <span>Suggested change</span>
      </div>
      <div className="suggestion-diff">
        {lines.map((line, i) => (
          <div key={i} className="diff-line diff-add">
            <span className="diff-line-content">{`  ${line}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Render comment body with markdown + suggestion blocks */
function CommentBody({ body }: { body: string }) {
  const segments = parseCommentBody(body)

  return (
    <div className="thread-comment-body">
      {segments.map((segment, i) => {
        if (segment.type === 'suggestion') {
          return <SuggestionBlock key={i} content={segment.content} />
        }
        return (
          <div key={i} className="thread-comment-markdown" data-color-mode="dark">
            <MarkdownPreview
              source={segment.content}
              style={{ backgroundColor: 'transparent', color: 'inherit', fontSize: '13px' }}
            />
          </div>
        )
      })}
    </div>
  )
}

function applyReactionToComment(
  comment: PRReviewComment,
  content: PRCommentReactionContent
): PRReviewComment {
  const existing = comment.reactions.find(reaction => reaction.content === content)

  if (existing?.viewerHasReacted) {
    return comment
  }

  const nextReactions = comment.reactions.map(reaction =>
    reaction.content === content
      ? {
          ...reaction,
          viewerHasReacted: true,
          count: reaction.count + 1,
        }
      : reaction
  )

  return {
    ...comment,
    reactions: nextReactions,
  }
}

function applyReactionToResult(
  prev: PRThreadsResult,
  commentId: string,
  content: PRCommentReactionContent
): PRThreadsResult {
  return {
    ...prev,
    threads: prev.threads.map(thread => ({
      ...thread,
      comments: thread.comments.map(comment =>
        comment.id === commentId ? applyReactionToComment(comment, content) : comment
      ),
    })),
    issueComments: prev.issueComments.map(comment =>
      comment.id === commentId ? applyReactionToComment(comment, content) : comment
    ),
  }
}

/** A single comment in GitHub style — avatar on left, content on right */
function CommentCard({
  comment,
  isFirst,
  onReact,
}: {
  comment: PRReviewComment
  isFirst?: boolean
  onReact?: (commentId: string, content: PRCommentReactionContent) => Promise<void>
}) {
  const [reacting, setReacting] = useState<PRCommentReactionContent | null>(null)

  const handleReact = useCallback(
    async (content: PRCommentReactionContent) => {
      if (!onReact || reacting) return
      setReacting(content)
      try {
        await onReact(comment.id, content)
      } catch (err) {
        console.error('Failed to add reaction:', err)
      } finally {
        setReacting(null)
      }
    },
    [comment.id, onReact, reacting]
  )

  return (
    <div className={`thread-comment ${isFirst ? 'thread-comment-first' : ''}`}>
      <div className="thread-comment-avatar-col">
        {comment.authorAvatarUrl ? (
          <img src={comment.authorAvatarUrl} alt={comment.author} className="thread-comment-avatar" />
        ) : (
          <div className="thread-comment-avatar-placeholder">
            {comment.author.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="thread-comment-content">
        <div className="thread-comment-header">
          <span className="thread-comment-username">{comment.author}</span>
          <span className="thread-comment-time" title={new Date(comment.createdAt).toLocaleString()}>
            {formatDistanceToNow(comment.createdAt)}
          </span>
        </div>
        <CommentBody body={comment.body} />
        {onReact && (
          <div className="thread-comment-reactions">
            {REACTION_OPTIONS.map(option => {
              const reaction = comment.reactions.find(r => r.content === option.content)
              const active = reaction?.viewerHasReacted || false
              const count = reaction?.count || 0

              return (
                <button
                  key={option.content}
                  className={`thread-comment-reaction ${active ? 'active' : ''}`}
                  onClick={() => handleReact(option.content)}
                  disabled={reacting !== null}
                  title={option.label}
                >
                  <span>{option.emoji}</span>
                  {count > 0 && <span className="thread-comment-reaction-count">{count}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewThreadCard({
  thread,
  pr,
  onReplyAdded,
  onResolveToggled,
  onReactToComment,
}: {
  thread: PRReviewThread
  pr: PRDetailInfo
  onReplyAdded: (threadId: string, comment: PRReviewComment) => void
  onResolveToggled: (threadId: string, resolved: boolean) => void
  onReactToComment: (commentId: string, content: PRCommentReactionContent) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(!thread.isResolved && !thread.isOutdated)
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const firstComment = thread.comments[0]
  const remainingComments = thread.comments.slice(1)
  const ownerRepo = parseOwnerRepoFromUrl(pr.url)
  const diffHunk = firstComment?.diffHunk

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || !ownerRepo || sending) return
    setSending(true)
    try {
      const newComment = await enqueue(
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          return await client.replyToReviewThread(ownerRepo.owner, pr.id, thread.id, replyText.trim())
        },
        { name: `reply-thread-${thread.id}` }
      )
      onReplyAdded(thread.id, newComment)
      setReplyText('')
      setReplying(false)
    } catch (err) {
      console.error('Failed to reply:', err)
    } finally {
      setSending(false)
    }
  }, [replyText, ownerRepo, sending, enqueue, accounts, pr.id, thread.id, onReplyAdded])

  const handleResolveToggle = useCallback(async () => {
    if (!ownerRepo || resolving) return
    setResolving(true)
    try {
      await enqueue(
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          if (thread.isResolved) {
            await client.unresolveReviewThread(ownerRepo.owner, thread.id)
          } else {
            await client.resolveReviewThread(ownerRepo.owner, thread.id)
          }
        },
        { name: `resolve-thread-${thread.id}` }
      )
      onResolveToggled(thread.id, !thread.isResolved)
    } catch (err) {
      console.error('Failed to toggle resolve:', err)
    } finally {
      setResolving(false)
    }
  }, [ownerRepo, resolving, enqueue, accounts, thread.id, thread.isResolved, onResolveToggled])

  useEffect(() => {
    if (replying && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [replying])

  const statusClass = thread.isResolved ? 'resolved' : thread.isOutdated ? 'outdated' : 'active'

  return (
    <div className={`review-thread ${statusClass}`}>
      {/* File path header bar */}
      <div className="review-thread-header" onClick={() => setExpanded(!expanded)}>
        <span className="review-thread-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <FileCode size={13} className="review-thread-file-icon" />
        <div className="review-thread-path-group">
          <span className="review-thread-path">
            {thread.path || 'General review comment'}
          </span>
          {thread.line != null && (
            <span className="review-thread-line-label">
              {thread.startLine != null && thread.startLine !== thread.line
                ? `Comment on lines ${thread.startLine} to ${thread.line}`
                : `Comment on line ${thread.line}`}
            </span>
          )}
        </div>
        <div className="review-thread-header-right">
          <span className="review-thread-comment-count">
            <MessageCircle size={11} />
            {thread.comments.length}
          </span>
          {thread.isResolved && (
            <span className="review-thread-badge resolved">
              <CheckCircle2 size={10} />
              Resolved
            </span>
          )}
          {thread.isOutdated && (
            <span className="review-thread-badge outdated">
              <Clock size={10} />
              Outdated
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="review-thread-body">
          {/* Diff hunk code context */}
          {diffHunk && <DiffHunk hunk={diffHunk} />}

          {/* Comments */}
          <div className="review-thread-comments">
            {firstComment && <CommentCard comment={firstComment} isFirst onReact={onReactToComment} />}
            {remainingComments.map(c => (
              <CommentCard key={c.id} comment={c} onReact={onReactToComment} />
            ))}
          </div>

          {/* Actions bar */}
          <div className="review-thread-actions">
            {replying ? (
              <div className="thread-reply-form">
                <textarea
                  ref={textareaRef}
                  className="thread-reply-input"
                  placeholder="Write a reply…"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      handleSendReply()
                    }
                    if (e.key === 'Escape') {
                      setReplying(false)
                      setReplyText('')
                    }
                  }}
                  rows={3}
                  disabled={sending}
                />
                <div className="thread-reply-buttons">
                  <span className="thread-reply-hint">Ctrl+Enter to send · Esc to cancel</span>
                  <button
                    className="thread-reply-cancel"
                    onClick={() => { setReplying(false); setReplyText('') }}
                    disabled={sending}
                  >
                    Cancel
                  </button>
                  <button
                    className="thread-reply-send"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sending}
                  >
                    {sending ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                    Reply
                  </button>
                </div>
              </div>
            ) : (
              <div className="thread-action-row">
                <button className="thread-reply-btn" onClick={() => setReplying(true)}>
                  <MessageSquarePlus size={13} />
                  Reply
                </button>
                <button
                  className={`thread-resolve-btn ${thread.isResolved ? 'unresolve' : 'resolve'}`}
                  onClick={handleResolveToggle}
                  disabled={resolving}
                  title={thread.isResolved ? 'Unresolve conversation' : 'Resolve conversation'}
                >
                  {resolving ? (
                    <Loader2 size={13} className="spin" />
                  ) : thread.isResolved ? (
                    <RotateCcw size={13} />
                  ) : (
                    <Check size={13} />
                  )}
                  {thread.isResolved ? 'Unresolve' : 'Resolve conversation'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function PRThreadsPanel({ pr }: PRThreadsPanelProps) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PRThreadsResult | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all')
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [showResolved, setShowResolved] = useState(true)
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const fetchThreads = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      if (!ownerRepo) throw new Error('Could not parse owner/repo from PR URL')

      const result = await enqueueRef.current(
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRThreads(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `pr-threads-${pr.repository}-${pr.id}` }
      )
      setData(result)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accounts, pr.id, pr.repository, pr.url])

  useEffect(() => {
    fetchThreads()
  }, [fetchThreads])

  const handleReplyAdded = useCallback((threadId: string, comment: PRReviewComment) => {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        threads: prev.threads.map(t =>
          t.id === threadId ? { ...t, comments: [...t.comments, comment] } : t
        ),
      }
    })
  }, [])

  const handleResolveToggled = useCallback((threadId: string, resolved: boolean) => {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        threads: prev.threads.map(t =>
          t.id === threadId ? { ...t, isResolved: resolved } : t
        ),
      }
    })
  }, [])

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || sendingComment) return
    const ownerRepo = parseOwnerRepoFromUrl(pr.url)
    if (!ownerRepo) return

    setSendingComment(true)
    try {
      const newComment = await enqueueRef.current(
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          return await client.addPRComment(ownerRepo.owner, ownerRepo.repo, pr.id, commentText.trim())
        },
        { name: `add-comment-${pr.repository}-${pr.id}` }
      )
      setData(prev => prev ? { ...prev, issueComments: [...prev.issueComments, newComment] } : prev)
      setCommentText('')
    } catch (err) {
      console.error('Failed to add comment:', err)
    } finally {
      setSendingComment(false)
    }
  }, [commentText, sendingComment, pr.url, pr.id, pr.repository, accounts])

  const handleReactToComment = useCallback(
    async (commentId: string, content: PRCommentReactionContent) => {
      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      if (!ownerRepo) return

      await enqueueRef.current(
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          await client.addCommentReaction(ownerRepo.owner, commentId, content)
        },
        { name: `add-comment-reaction-${pr.repository}-${pr.id}-${commentId}-${content}` }
      )

      setData(prev => (prev ? applyReactionToResult(prev, commentId, content) : prev))
    },
    [accounts, pr.url, pr.repository, pr.id]
  )

  if (loading) {
    return (
      <div className="pr-threads-loading">
        <Loader2 size={24} className="spin" />
        <p>Loading conversations…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="pr-threads-error">
        <p>Failed to load conversations</p>
        <p className="pr-threads-error-detail">{error || 'Unknown error'}</p>
        <button className="pr-threads-retry" onClick={fetchThreads}>Retry</button>
      </div>
    )
  }

  const activeThreads = data.threads.filter(t => !t.isResolved)
  const resolvedThreads = data.threads.filter(t => t.isResolved)

  const filteredThreads = data.threads.filter(t => {
    if (filter === 'active') return !t.isResolved
    if (filter === 'resolved') return t.isResolved
    return true
  })

  return (
    <div className="pr-threads-container">
      {/* Section title with summary */}
      <div className="pr-threads-section-title">
        <MessageCircle size={16} />
        <span>Conversations</span>
        {data.threads.length > 0 && (
          <span className="pr-threads-summary">
            {activeThreads.length > 0 && (
              <span className="pr-threads-active-count">
                {activeThreads.length} unresolved
              </span>
            )}
            {resolvedThreads.length > 0 && (
              <span className="pr-threads-resolved-count">
                <CheckCircle2 size={12} />
                {resolvedThreads.length} resolved
              </span>
            )}
          </span>
        )}
      </div>

      {/* Review Threads */}
      {data.threads.length > 0 && (
        <div className="pr-threads-section">
          <div className="pr-threads-toolbar">
            <div className="pr-threads-filters">
              <button
                className={`pr-threads-filter ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({data.threads.length})
              </button>
              <button
                className={`pr-threads-filter ${filter === 'active' ? 'active' : ''}`}
                onClick={() => setFilter('active')}
              >
                <Eye size={11} />
                Active ({activeThreads.length})
              </button>
              <button
                className={`pr-threads-filter ${filter === 'resolved' ? 'active' : ''}`}
                onClick={() => setFilter('resolved')}
              >
                <CheckCircle2 size={11} />
                Resolved ({resolvedThreads.length})
              </button>
            </div>
            {resolvedThreads.length > 0 && filter === 'all' && (
              <button
                className="pr-threads-toggle-resolved"
                onClick={() => setShowResolved(!showResolved)}
              >
                {showResolved ? 'Hide' : 'Show'} resolved
              </button>
            )}
          </div>

          <div className="pr-threads-list">
            {filteredThreads
              .filter(t => filter !== 'all' || !t.isResolved || showResolved)
              .map(thread => (
                <ReviewThreadCard
                  key={thread.id}
                  thread={thread}
                  pr={pr}
                  onReplyAdded={handleReplyAdded}
                  onResolveToggled={handleResolveToggled}
                  onReactToComment={handleReactToComment}
                />
              ))}
            {filteredThreads.length === 0 && (
              <div className="pr-threads-empty">
                No {filter === 'all' ? '' : filter} threads
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issue Comments */}
      {data.issueComments.length > 0 && (
        <div className="pr-threads-section">
          <div className="pr-threads-comments-title">
            <MessageCircle size={14} />
            {data.issueComments.length} {data.issueComments.length === 1 ? 'comment' : 'comments'}
          </div>
          <div className="pr-threads-comments">
            {data.issueComments.map(c => (
              <CommentCard key={c.id} comment={c} onReact={handleReactToComment} />
            ))}
          </div>
        </div>
      )}

      {data.threads.length === 0 && data.issueComments.length === 0 && (
        <div className="pr-threads-empty-state">
          <MessageCircle size={32} />
          <p>No conversations yet</p>
        </div>
      )}

      {/* Add comment form */}
      <div className="pr-threads-add-comment">
        <div className="pr-threads-add-comment-header">Leave a comment</div>
        <textarea
          ref={commentTextareaRef}
          className="pr-threads-comment-input"
          placeholder="Add a comment…"
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              handleAddComment()
            }
          }}
          rows={3}
          disabled={sendingComment}
        />
        <div className="pr-threads-comment-actions">
          <span className="thread-reply-hint">Ctrl+Enter to send</span>
          <button
            className="pr-threads-comment-submit"
            onClick={handleAddComment}
            disabled={!commentText.trim() || sendingComment}
          >
            {sendingComment ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
            Comment
          </button>
        </div>
      </div>
    </div>
  )
}
