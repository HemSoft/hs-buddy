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

function getResolveActionIcon(resolving: boolean, isResolved: boolean) {
  if (resolving) {
    return <Loader2 size={13} className="spin" />
  }
  return isResolved ? <RotateCcw size={13} /> : <Check size={13} />
}

function getResolveActionText(isResolved: boolean) {
  return isResolved ? 'Unresolve' : 'Resolve conversation'
}

function getResolveActionClass(isResolved: boolean) {
  return `thread-resolve-btn ${isResolved ? 'unresolve' : 'resolve'}`
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
  const resolveLabel = getResolveActionText(thread.isResolved)

  return (
    <div className="thread-action-row">
      <button className="thread-reply-btn" onClick={() => dispatch({ type: 'start_reply' })}>
        <MessageSquarePlus size={13} />
        Reply
      </button>
      <button
        className={getResolveActionClass(thread.isResolved)}
        onClick={handleResolveToggle}
        disabled={resolving}
        title={resolveLabel}
      >
        {getResolveActionIcon(resolving, thread.isResolved)}
        {resolveLabel}
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

function getThreadStatusClass(thread: PRReviewThread) {
  if (thread.isResolved) return 'resolved'
  return thread.isOutdated ? 'outdated' : 'active'
}

function shouldStartExpanded(thread: PRReviewThread) {
  return !thread.isResolved && !thread.isOutdated
}

function createInitialThreadState(thread: PRReviewThread): ThreadState {
  return {
    expanded: shouldStartExpanded(thread),
    replying: false,
    replyText: '',
    sending: false,
    resolving: false,
  }
}

function useThreadDerivedState(thread: PRReviewThread) {
  const firstComment = thread.comments[0]
  const remainingComments = thread.comments.slice(1)
  const diffHunk = firstComment?.diffHunk
  const statusClass = getThreadStatusClass(thread)
  return { firstComment, remainingComments, diffHunk, statusClass }
}

function ThreadChevron({ expanded }: { expanded: boolean }) {
  return (
    <span className="review-thread-chevron">
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </span>
  )
}

function ThreadDiffSection({ diffHunk }: { diffHunk?: string | null }) {
  if (!diffHunk) return null
  return <DiffHunk hunk={diffHunk} />
}

function ThreadFirstComment({
  comment,
  onReactToComment,
}: {
  comment?: PRReviewComment
  onReactToComment: (commentId: string, content: PRCommentReactionContent) => Promise<void>
}) {
  if (!comment) return null
  return <CommentCard comment={comment} isFirst onReact={onReactToComment} />
}

function ThreadReplySection({
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
  return replying ? (
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
  )
}

function ThreadExpandedBody({
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
  diffHunk?: string | null
  firstComment?: PRReviewComment
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
  if (!expanded) return null

  return (
    <div className="review-thread-body">
      <ThreadDiffSection diffHunk={diffHunk} />
      <div className="review-thread-comments">
        <ThreadFirstComment comment={firstComment} onReactToComment={onReactToComment} />
        {remainingComments.map(comment => (
          <CommentCard key={comment.id} comment={comment} onReact={onReactToComment} />
        ))}
      </div>
      <div className="review-thread-actions">
        <ThreadReplySection
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
    </div>
  )
}

function useThreadReplyHandler({
  replyText,
  ownerRepo,
  sending,
  enqueue,
  accounts,
  prId,
  threadId,
  dispatch,
  onReplyAdded,
}: {
  replyText: string
  ownerRepo: ReturnType<typeof parseOwnerRepoFromUrl>
  sending: boolean
  enqueue: ReturnType<typeof useTaskQueue>['enqueue']
  accounts: ReturnType<typeof useGitHubAccounts>['accounts']
  prId: PRDetailInfo['id']
  threadId: string
  dispatch: React.Dispatch<ThreadAction>
  onReplyAdded: (threadId: string, comment: PRReviewComment) => void
}) {
  return useCallback(async () => {
    if (!replyText.trim() || !ownerRepo || sending) return

    dispatch({ type: 'start_sending' })
    try {
      const newComment = await enqueue(
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          return await client.replyToReviewThread(ownerRepo.owner, prId, threadId, replyText.trim())
        },
        { name: `reply-thread-${threadId}` }
      )
      onReplyAdded(threadId, newComment)
      dispatch({ type: 'finish_sending' })
    } catch (err: unknown) {
      console.error('Failed to reply:', err)
      dispatch({ type: 'send_failed' })
    }
  }, [replyText, ownerRepo, sending, enqueue, accounts, prId, threadId, dispatch, onReplyAdded])
}

async function toggleThreadResolution(
  client: GitHubClient,
  owner: string,
  threadId: string,
  isResolved: boolean
) {
  if (isResolved) {
    await client.unresolveReviewThread(owner, threadId)
    return
  }

  await client.resolveReviewThread(owner, threadId)
}

function useThreadResolveToggleHandler({
  ownerRepo,
  resolving,
  enqueue,
  accounts,
  thread,
  dispatch,
  onResolveToggled,
}: {
  ownerRepo: ReturnType<typeof parseOwnerRepoFromUrl>
  resolving: boolean
  enqueue: ReturnType<typeof useTaskQueue>['enqueue']
  accounts: ReturnType<typeof useGitHubAccounts>['accounts']
  thread: PRReviewThread
  dispatch: React.Dispatch<ThreadAction>
  onResolveToggled: (threadId: string, resolved: boolean) => void
}) {
  return useCallback(async () => {
    /* v8 ignore start */
    if (!ownerRepo || resolving) return
    /* v8 ignore stop */

    dispatch({ type: 'start_resolving' })
    try {
      await enqueue(
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          await toggleThreadResolution(client, ownerRepo.owner, thread.id, thread.isResolved)
        },
        { name: `resolve-thread-${thread.id}` }
      )
      onResolveToggled(thread.id, !thread.isResolved)
    } catch (err: unknown) {
      console.error('Failed to toggle resolve:', err)
    } finally {
      dispatch({ type: 'done_resolving' })
    }
  }, [ownerRepo, resolving, enqueue, accounts, thread, dispatch, onResolveToggled])
}

function useReplyTextareaFocus(
  replying: boolean,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
) {
  useEffect(() => {
    if (replying && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [replying, textareaRef])
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
  const [state, dispatch] = useReducer(threadReducer, thread, createInitialThreadState)
  const { expanded, replying, replyText, sending, resolving } = state
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { firstComment, remainingComments, diffHunk, statusClass } = useThreadDerivedState(thread)
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url), [pr.url])
  const handleSendReply = useThreadReplyHandler({
    replyText,
    ownerRepo,
    sending,
    enqueue,
    accounts,
    prId: pr.id,
    threadId: thread.id,
    dispatch,
    onReplyAdded,
  })
  const handleResolveToggle = useThreadResolveToggleHandler({
    ownerRepo,
    resolving,
    enqueue,
    accounts,
    thread,
    dispatch,
    onResolveToggled,
  })

  const handleHeaderKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      dispatch({ type: 'toggle_expand' })
    }
  }, [])

  useReplyTextareaFocus(replying, textareaRef)

  return (
    <div className={`review-thread ${statusClass}`}>
      <div
        className="review-thread-header"
        role="button"
        tabIndex={0}
        onClick={() => dispatch({ type: 'toggle_expand' })}
        onKeyDown={handleHeaderKeyDown}
      >
        <ThreadChevron expanded={expanded} />
        <FileCode size={13} className="review-thread-file-icon" />
        <ThreadPathGroup thread={thread} />
        <ThreadHeaderBadges thread={thread} />
      </div>

      <ThreadExpandedBody
        expanded={expanded}
        diffHunk={diffHunk}
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
