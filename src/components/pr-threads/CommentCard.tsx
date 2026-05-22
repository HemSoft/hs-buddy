import { useCallback, useState } from 'react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import remarkGemoji from 'remark-gemoji'
import { GitPullRequestArrow } from 'lucide-react'
import { type PRCommentReactionContent, type PRReviewComment } from '../../api/github'
import { formatDistanceToNow } from '../../utils/dateUtils'
import { parseCommentBody } from './commentCardUtils'

const REACTION_OPTIONS: Array<{ content: PRCommentReactionContent; emoji: string; label: string }> =
  [
    { content: 'THUMBS_UP', emoji: '👍', label: 'Thumbs up' },
    { content: 'THUMBS_DOWN', emoji: '👎', label: 'Thumbs down' },
    { content: 'LAUGH', emoji: '😄', label: 'Laugh' },
    { content: 'HOORAY', emoji: '🎉', label: 'Hooray' },
    { content: 'CONFUSED', emoji: '😕', label: 'Confused' },
    { content: 'HEART', emoji: '❤️', label: 'Heart' },
    { content: 'ROCKET', emoji: '🚀', label: 'Rocket' },
    { content: 'EYES', emoji: '👀', label: 'Eyes' },
  ]

function SuggestionBlock({ content }: { content: string }) {
  const lines = content.split('\n')
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
        {(() => {
          let charOffset = 0
          return lines.map(line => {
            const key = `suggestion-line-${charOffset}-${encodeURIComponent(line)}`
            charOffset += line.length + 1
            return (
              <div key={key} className="diff-line diff-add">
                <span className="diff-line-content">{`  ${line}`}</span>
              </div>
            )
          })
        })()}
      </div>
    </div>
  )
}

function CommentBody({ body, bodyHtml }: { body: string; bodyHtml: string | null }) {
  const hasSuggestionBlock = /```suggestion\s*\n[\s\S]*?```/.test(body)

  if (!hasSuggestionBlock && bodyHtml && bodyHtml.trim()) {
    return (
      <div className="thread-comment-body thread-comment-markdown" data-color-mode="dark">
        <MarkdownPreview
          source={body}
          remarkPlugins={[remarkGemoji]}
          style={{ backgroundColor: 'transparent', color: 'inherit', fontSize: '13px' }}
        />
      </div>
    )
  }

  const segments = parseCommentBody(body)

  return (
    <div className="thread-comment-body">
      {segments.map((segment, pos) => {
        const segKey = `${segment.type}-${pos}-${segment.content.length}-${segment.content.slice(0, 40)}`
        if (segment.type === 'suggestion') {
          return <SuggestionBlock key={segKey} content={segment.content} />
        }
        return (
          <div key={segKey} className="thread-comment-markdown" data-color-mode="dark">
            <MarkdownPreview
              source={segment.content}
              remarkPlugins={[remarkGemoji]}
              style={{ backgroundColor: 'transparent', color: 'inherit', fontSize: '13px' }}
            />
          </div>
        )
      })}
    </div>
  )
}

function getCommentTimestamp(comment: PRReviewComment): string {
  const timestamp = comment.updatedAt > comment.createdAt ? comment.updatedAt : comment.createdAt
  return new Date(timestamp).toLocaleString()
}

function getCommentRelativeTime(comment: PRReviewComment): string {
  const timestamp = comment.updatedAt > comment.createdAt ? comment.updatedAt : comment.createdAt
  return formatDistanceToNow(timestamp)
}

function CommentReactionButton({
  option,
  reaction,
  reacting,
  onReact,
}: {
  option: (typeof REACTION_OPTIONS)[number]
  reaction: PRReviewComment['reactions'][number] | undefined
  reacting: boolean
  onReact: (content: PRCommentReactionContent) => void
}) {
  const active = reaction?.viewerHasReacted || false
  const count = reaction?.count || 0

  return (
    <button
      className={`thread-comment-reaction ${active ? 'active' : ''}`}
      onClick={e => {
        e.preventDefault()
        onReact(option.content)
      }}
      disabled={reacting}
      title={option.label}
    >
      <span>{option.emoji}</span>
      {count > 0 && <span className="thread-comment-reaction-count">{count}</span>}
    </button>
  )
}

function CommentReactions({
  comment,
  reacting,
  onReact,
}: {
  comment: PRReviewComment
  reacting: PRCommentReactionContent | null
  onReact: (content: PRCommentReactionContent) => void
}) {
  return (
    <div className="thread-comment-reactions">
      {REACTION_OPTIONS.map(option => (
        <CommentReactionButton
          key={option.content}
          option={option}
          reaction={comment.reactions.find(r => r.content === option.content)}
          reacting={reacting !== null}
          onReact={onReact}
        />
      ))}
    </div>
  )
}

export function CommentCard({
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
      /* v8 ignore start */
      if (!onReact || reacting) return
      /* v8 ignore stop */
      setReacting(content)
      try {
        await onReact(comment.id, content)
      } catch (err: unknown) {
        console.error('Failed to add reaction:', err)
      } finally {
        setReacting(null)
      }
    },
    [comment.id, onReact, reacting]
  )

  return (
    <details
      className={`thread-comment thread-comment-collapsible ${isFirst ? 'thread-comment-first' : ''}`}
      open
    >
      <summary className="thread-comment-summary-row">
        <div className="thread-comment-avatar-col">
          {comment.authorAvatarUrl ? (
            <img
              src={comment.authorAvatarUrl}
              alt={comment.author}
              className="thread-comment-avatar"
            />
          ) : (
            <div className="thread-comment-avatar-placeholder">
              {comment.author.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="thread-comment-header">
          <span className="thread-comment-username">{comment.author}</span>
          <span className="thread-comment-time" title={getCommentTimestamp(comment)}>
            {getCommentRelativeTime(comment)}
          </span>
        </div>
      </summary>
      <div className="thread-comment-collapsible-body">
        <CommentBody body={comment.body} bodyHtml={comment.bodyHtml} />
        {onReact && <CommentReactions comment={comment} reacting={reacting} onReact={handleReact} />}
      </div>
    </details>
  )
}
