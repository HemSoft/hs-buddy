import {
  type PRCommentReactionContent,
  type PRReviewComment,
  type PRThreadsResult,
} from '../api/github'

// Note: This function intentionally adds a new reaction entry when the reaction
// type is absent from the array. The original PRThreadsPanel code silently
// ignored missing reaction types (the .map() would fall through unchanged).
// This is a bug fix — the API may omit reaction types with count 0.
function applyReactionToComment(
  comment: PRReviewComment,
  content: PRCommentReactionContent
): PRReviewComment {
  const existing = comment.reactions.find(reaction => reaction.content === content)

  if (existing?.viewerHasReacted) {
    return comment
  }

  if (!existing) {
    return {
      ...comment,
      reactions: [...comment.reactions, { content, viewerHasReacted: true, count: 1 }],
    }
  }

  const nextReactions = comment.reactions.map(reaction =>
    reaction.content === content
      ? { ...reaction, viewerHasReacted: true, count: reaction.count + 1 }
      : reaction
  )

  return { ...comment, reactions: nextReactions }
}

export function applyReactionToResult(
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
