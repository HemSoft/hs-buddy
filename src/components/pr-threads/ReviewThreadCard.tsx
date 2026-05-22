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
import { throwIfAborted } from '../../utils/errorUtils'
import { modLabel } from '../../utils/platform'
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

type ThreadTransitions = {
  [K in ThreadAction['type']]: (
    s: ThreadState,
    a: Extract<ThreadAction, { type: K }>
  ) => ThreadState
}

const THREAD_TRANSITIONS: ThreadTransitions = {
  toggle_expand: s => ({ ...s, expanded: !s.expanded }),
  start_reply: s => ({ ...s, replying: true }),
  cancel_reply: s => ({ ...s, replying: false, replyText: '' }),
  set_reply_text: (s, a) => ({ ...s, replyText: a.text }),
  start_sending: s => ({ ...s, sending: true }),
  finish_sending: s => ({ ...s, sending: false, replying: false, replyText: '' }),
  send_failed: s => ({ ...s, sending: false }),
  start_resolving: s => ({ ...s, resolving: true }),
  done_resolving: s => ({ ...s, resolving: false }),
}

function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  // Table is exhaustive over ThreadAction['type'] — safe to widen at the call site
  type Handler = (s: ThreadState, a: ThreadAction) => ThreadState
  return (THREAD_TRANSITIONS[action.type] as Handler)(state, action)
}

function ThreadReplyForm({
  replyText,
  sending,
  textareaRef,
  dispatch,
  handleSendReply,
}: {
  replyText: string
  sending: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  dispatch: React.Dispatch<ThreadAction>
  handleSendReply: () => void
}) {
  return (
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
        <span className="thread-reply-hint">{modLabel}+Enter to send - Esc to cancel</span>
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
  )
}

function getResolveActionConfig(thread: PRReviewThread, resolving: boolean) {
  if (resolving) {
    return {
      icon: <Loader2 size={13} className="spin" />,
      className: 'resolve',
      title: 'Resolve conversation',
      label: 'Resolve conversation',
    }
  }

  if (thread.isResolved) {
    return {
      icon: <RotateCcw size={13} />,
      className: 'unresolve',
      title: 'Unresolve conversation',
      label: 'Unresolve',
    }
  }

  return {
    icon: <Check size={13} />,
    className: 'resolve',
    title: 'Resolve conversation',
    label: 'Resolve conversation',
  }
}

function ThreadActionRow({
  thread,
  resolving,
  dispatch,
  handleResolveToggle,
}: {
  thread: PRReviewThread
  resolving: boolean
  dispatch: React.Dispatch<ThreadAction>
  handleResolveToggle: () => void
}) {
  const resolveAction = getResolveActionConfig(thread, resolving)

  return (
    <div className="thread-action-row">
      <button className="thread-reply-btn" onClick={() => dispatch({ type: 'start_reply' })}>
        <MessageSquarePlus size={13} />
        Reply
      </button>
      <button
        className={`thread-resolve-btn ${resolveAction.className}`}
        onClick={handleResolveToggle}
        disabled={resolving}
        title={resolveAction.title}
      >
        {resolveAction.icon}
        {resolveAction.label}
      </button>
    </div>
  )
}

function ThreadHeaderBadges({ thread }: { thread: PRReviewThread }) {
  return (
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
  )
}

function ThreadPathGroup({ thread }: { thread: PRReviewThread }) {
  return (
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
  )
}

function useThreadDerivedState(thread: PRReviewThread) {
  const firstComment = thread.comments[0]
  const remainingComments = thread.comments.slice(1)
  const diffHunk = firstComment?.diffHunk
  const statusClass = thread.isResolved ? 'resolved' : thread.isOutdated ? 'outdated' : 'active'
  return { firstComment, remainingComments, diffHunk, statusClass }
}

function ThreadComments({
  firstComment,
  remainingComments,
  onReactToComment,
}: {
  firstComment: PRReviewComment | undefined
  remainingComments: PRReviewComment[]
  onReactToComment: (commentId: string, content: PRCommentReactionContent) => Promise<void>
}) {
  return (
    <div className="review-thread-comments">
      {firstComment ? <CommentCard comment={firstComment} isFirst onReact={onReactToComment} /> : null}
      {remainingComments.map(c => (
        <CommentCard key={c.id} comment={c} onReact={onReactToComment} />
      ))}
    </div>
  )
}

function ThreadActionArea({
  replying,
  replyText,
  sending,
  textareaRef,
  dispatch,
  handleSendReply,
  thread,
  resolving,
  handleResolveToggle,
}: {
  replying: boolean
  replyText: string
  sending: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  dispatch: React.Dispatch<ThreadAction>
  handleSendReply: () => void
  thread: PRReviewThread
  resolving: boolean
  handleResolveToggle: () => void
}) {
  return (
    <div className="review-thread-actions">
      {replying ? (
        <ThreadReplyForm
          replyText={replyText}
          sending={sending}
          textareaRef={textareaRef}
          dispatch={dispatch}
          handleSendReply={handleSendReply}
        />
      ) : (
        <ThreadActionRow
          thread={thread}
          resolving={resolving}
          dispatch={dispatch}
          handleResolveToggle={handleResolveToggle}
        />
      )}
    </div>
  )
}

function ReviewThreadBody({
  expanded,
  diffHunk,
  firstComment,
  remainingComments,
  onReactToComment,
  replying,
  replyText,
  sending,
  textareaRef,
  dispatch,
  handleSendReply,
  thread,
  resolving,
  handleResolveToggle,
}: {
  expanded: boolean
  diffHunk: string | undefined
  firstComment: PRReviewComment | undefined
  remainingComments: PRReviewComment[]
  onReactToComment: (commentId: string, content: PRCommentReactionContent) => Promise<void>
  replying: boolean
  replyText: string
  sending: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  dispatch: React.Dispatch<ThreadAction>
  handleSendReply: () => void
  thread: PRReviewThread
  resolving: boolean
  handleResolveToggle: () => void
}) {
  if (!expanded) {
    return null
  }

  return (
    <div className="review-thread-body">
      {diffHunk ? <DiffHunk hunk={diffHunk} /> : null}
      <ThreadComments
        firstComment={firstComment}
        remainingComments={remainingComments}
        onReactToComment={onReactToComment}
      />
      <ThreadActionArea
        replying={replying}
        replyText={replyText}
        sending={sending}
        textareaRef={textareaRef}
        dispatch={dispatch}
        handleSendReply={handleSendReply}
        thread={thread}
        resolving={resolving}
        handleResolveToggle={handleResolveToggle}
      />
    </div>
  )
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

  const { firstComment, remainingComments, diffHunk, statusClass } = useThreadDerivedState(thread)
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url), [pr.url])

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || !ownerRepo || sending) return

    dispatch({ type: 'start_sending' })
    try {
      const newComment = await enqueue(
        async signal => {
          throwIfAborted(signal)
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
    } catch (err: unknown) {
      console.error('Failed to reply:', err)
      dispatch({ type: 'send_failed' })
    }
  }, [replyText, ownerRepo, sending, enqueue, accounts, pr.id, thread.id, onReplyAdded])

  const handleResolveToggle = useCallback(async () => {
    /* v8 ignore start */
    if (!ownerRepo || resolving) return
    /* v8 ignore stop */

    dispatch({ type: 'start_resolving' })
    try {
      await enqueue(
        async signal => {
          throwIfAborted(signal)
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
    } catch (err: unknown) {
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
        <ThreadPathGroup thread={thread} />
        <ThreadHeaderBadges thread={thread} />
      </div>

      <ReviewThreadBody
        expanded={expanded}
        diffHunk={diffHunk ?? undefined}
        firstComment={firstComment}
        remainingComments={remainingComments}
        onReactToComment={onReactToComment}
        replying={replying}
        replyText={replyText}
        sending={sending}
        textareaRef={textareaRef}
        dispatch={dispatch}
        handleSendReply={handleSendReply}
        thread={thread}
        resolving={resolving}
        handleResolveToggle={handleResolveToggle}
      />
    </div>
  )
}
