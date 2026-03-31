import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCode,
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
} from '../../api/github'
import { useGitHubAccounts } from '../../hooks/useConfig'
import { useTaskQueue } from '../../hooks/useTaskQueue'
import type { PRDetailInfo } from '../../utils/prDetailView'
import { parseOwnerRepoFromUrl } from '../../utils/githubUrl'
import { DiffHunk } from './DiffHunk'
import { CommentCard } from './CommentCard'

interface ThreadState {
  expanded: boolean
  replying: boolean
  replyText: string
  sending: boolean
  resolving: boolean
}

type ThreadAction =
  | { type: 'toggle_expand' }
  | { type: 'start_reply' }
  | { type: 'cancel_reply' }
  | { type: 'set_reply_text'; text: string }
  | { type: 'start_sending' }
  | { type: 'finish_sending' }
  | { type: 'send_failed' }
  | { type: 'start_resolving' }
  | { type: 'done_resolving' }

function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case 'toggle_expand':
      return { ...state, expanded: !state.expanded }
    case 'start_reply':
      return { ...state, replying: true }
    case 'cancel_reply':
      return { ...state, replying: false, replyText: '' }
    case 'set_reply_text':
      return { ...state, replyText: action.text }
    case 'start_sending':
      return { ...state, sending: true }
    case 'finish_sending':
      return { ...state, sending: false, replying: false, replyText: '' }
    case 'send_failed':
      return { ...state, sending: false }
    case 'start_resolving':
      return { ...state, resolving: true }
    case 'done_resolving':
      return { ...state, resolving: false }
  }
}

export function ReviewThreadCard({
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
  const [state, dispatch] = useReducer(threadReducer, {
    expanded: !thread.isResolved && !thread.isOutdated,
    replying: false,
    replyText: '',
    sending: false,
    resolving: false,
  })
  const { expanded, replying, replyText, sending, resolving } = state
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const firstComment = thread.comments[0]
  const remainingComments = thread.comments.slice(1)
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url), [pr.url])
  const diffHunk = firstComment?.diffHunk
  const statusClass = thread.isResolved ? 'resolved' : thread.isOutdated ? 'outdated' : 'active'

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || !ownerRepo || sending) return

    dispatch({ type: 'start_sending' })
    try {
      const newComment = await enqueue(
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          return await client.replyToReviewThread(
            ownerRepo.owner,
            pr.id,
            thread.id,
            replyText.trim()
          )
        },
        { name: `reply-thread-${thread.id}` }
      )
      onReplyAdded(thread.id, newComment)
      dispatch({ type: 'finish_sending' })
    } catch (err) {
      console.error('Failed to reply:', err)
      dispatch({ type: 'send_failed' })
    }
  }, [replyText, ownerRepo, sending, enqueue, accounts, pr.id, thread.id, onReplyAdded])

  const handleResolveToggle = useCallback(async () => {
    if (!ownerRepo || resolving) return

    dispatch({ type: 'start_resolving' })
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
      dispatch({ type: 'done_resolving' })
    }
  }, [ownerRepo, resolving, enqueue, accounts, thread.id, thread.isResolved, onResolveToggled])

  const handleHeaderKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      dispatch({ type: 'toggle_expand' })
    }
  }, [])

  useEffect(() => {
    if (replying && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [replying])

  return (
    <div className={`review-thread ${statusClass}`}>
      <div
        className="review-thread-header"
        role="button"
        tabIndex={0}
        onClick={() => dispatch({ type: 'toggle_expand' })}
        onKeyDown={handleHeaderKeyDown}
      >
        <span className="review-thread-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <FileCode size={13} className="review-thread-file-icon" />
        <div className="review-thread-path-group">
          <span className="review-thread-path">{thread.path || 'General review comment'}</span>
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
          {diffHunk && <DiffHunk hunk={diffHunk} />}
          <div className="review-thread-comments">
            {firstComment && (
              <CommentCard comment={firstComment} isFirst onReact={onReactToComment} />
            )}
            {remainingComments.map(c => (
              <CommentCard key={c.id} comment={c} onReact={onReactToComment} />
            ))}
          </div>
          <div className="review-thread-actions">
            {replying ? (
              <div className="thread-reply-form">
                <textarea
                  ref={textareaRef}
                  className="thread-reply-input"
                  placeholder="Write a reply..."
                  value={replyText}
                  onChange={e => dispatch({ type: 'set_reply_text', text: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      handleSendReply()
                    }
                    if (e.key === 'Escape') {
                      dispatch({ type: 'cancel_reply' })
                    }
                  }}
                  rows={3}
                  disabled={sending}
                />
                <div className="thread-reply-buttons">
                  <span className="thread-reply-hint">Ctrl+Enter to send - Esc to cancel</span>
                  <button
                    className="thread-reply-cancel"
                    onClick={() => dispatch({ type: 'cancel_reply' })}
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
                <button
                  className="thread-reply-btn"
                  onClick={() => dispatch({ type: 'start_reply' })}
                >
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
