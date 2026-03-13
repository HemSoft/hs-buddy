import { useCallback, useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import MarkdownPreview from '@uiw/react-markdown-preview'
import { GitPullRequestArrow } from 'lucide-react'
import { type PRCommentReactionContent, type PRReviewComment } from '../../api/github'
import { formatDistanceToNow } from '../../utils/dateUtils'

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

function parseCommentBody(
  body: string | null | undefined
): Array<{ type: 'text' | 'suggestion'; content: string }> {
  const segments: Array<{ type: 'text' | 'suggestion'; content: string }> = []
  const safeBody = body ?? ''
  const regex = /```suggestion\s*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(safeBody)) !== null) {
    if (match.index > lastIndex) {
      const text = safeBody.slice(lastIndex, match.index).trim()
      if (text) segments.push({ type: 'text', content: text })
    }
    segments.push({ type: 'suggestion', content: match[1] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < safeBody.length) {
    const text = safeBody.slice(lastIndex).trim()
    if (text) segments.push({ type: 'text', content: text })
  }

  if (segments.length === 0 && safeBody.trim()) {
    segments.push({ type: 'text', content: safeBody })
  }

  return segments
}

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
        {lines.map((line, i) => (
          <div key={`suggestion-line-${i}-${encodeURIComponent(line)}`} className="diff-line diff-add">
            <span className="diff-line-content">{`  ${line}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SafeHtml({ html, className, ...props }: { html: string; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = DOMPurify.sanitize(html)
    }
  }, [html])
  return <div ref={ref} className={className} {...props} />
}

function CommentBody({ body, bodyHtml }: { body: string; bodyHtml: string | null }) {
  const hasSuggestionBlock = /```suggestion\s*\n[\s\S]*?```/.test(body)

  if (!hasSuggestionBlock && bodyHtml && bodyHtml.trim()) {
    return (
      <SafeHtml
        html={bodyHtml}
        className="thread-comment-body thread-comment-markdown thread-comment-markdown-html"
        data-color-mode="dark"

      />
    )
  }

  const segments = parseCommentBody(body)

  return (
    <div className="thread-comment-body">
      {segments.map((segment, i) => {
        const segKey = `${segment.type}-${i}-${segment.content.length}-${segment.content.slice(0, 40)}`
        if (segment.type === 'suggestion') {
          return <SuggestionBlock key={segKey} content={segment.content} />
        }
        return (
          <div key={segKey} className="thread-comment-markdown" data-color-mode="dark">
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
      <div className="thread-comment-content">
        <div className="thread-comment-header">
          <span className="thread-comment-username">{comment.author}</span>
          <span
            className="thread-comment-time"
            title={new Date(comment.createdAt).toLocaleString()}
          >
            {formatDistanceToNow(comment.createdAt)}
          </span>
        </div>
        <CommentBody body={comment.body} bodyHtml={comment.bodyHtml} />
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
