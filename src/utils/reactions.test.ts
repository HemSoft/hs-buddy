import { describe, expect, it } from 'vitest'
import { applyReactionToResult } from './reactions'
import type {
  PRCommentReactionContent,
  PRReviewComment,
  PRThreadsResult,
} from '../api/github'

function makeComment(
  id: string,
  reactions: { content: PRCommentReactionContent; count: number; viewerHasReacted: boolean }[] = []
): PRReviewComment {
  return {
    id,
    author: 'alice',
    authorAvatarUrl: null,
    body: 'test',
    bodyHtml: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    url: 'https://github.com/test',
    diffHunk: null,
    reactions,
  }
}

function makeResult(
  threadComments: PRReviewComment[] = [],
  issueComments: PRReviewComment[] = []
): PRThreadsResult {
  return {
    threads: [
      {
        id: 'thread-1',
        isResolved: false,
        isOutdated: false,
        path: 'file.ts',
        line: 10,
        startLine: null,
        diffSide: null,
        comments: threadComments,
      },
    ],
    issueComments,
  }
}

describe('applyReactionToResult', () => {
  describe('when the reaction type is absent from the comment', () => {
    it('adds a new reaction entry with count 1', () => {
      const comment = makeComment('c1', [])
      const result = makeResult([comment])

      const updated = applyReactionToResult(result, 'c1', 'THUMBS_UP')

      expect(updated.threads[0].comments[0].reactions).toEqual([
        { content: 'THUMBS_UP', viewerHasReacted: true, count: 1 },
      ])
    })
  })

  describe('when the reaction type exists but viewer has not reacted', () => {
    it('increments count and sets viewerHasReacted to true', () => {
      const comment = makeComment('c1', [
        { content: 'HEART', count: 2, viewerHasReacted: false },
      ])
      const result = makeResult([comment])

      const updated = applyReactionToResult(result, 'c1', 'HEART')

      expect(updated.threads[0].comments[0].reactions).toEqual([
        { content: 'HEART', count: 3, viewerHasReacted: true },
      ])
    })
  })

  describe('when viewer has already reacted with the same type', () => {
    it('returns the comment unchanged', () => {
      const comment = makeComment('c1', [
        { content: 'ROCKET', count: 1, viewerHasReacted: true },
      ])
      const result = makeResult([comment])

      const updated = applyReactionToResult(result, 'c1', 'ROCKET')
      const updatedComment = updated.threads[0].comments[0]

      expect(updatedComment.reactions).toEqual([
        { content: 'ROCKET', count: 1, viewerHasReacted: true },
      ])
    })
  })

  describe('when comment is in issueComments', () => {
    it('applies the reaction to an issue comment', () => {
      const issueComment = makeComment('ic1', [])
      const result = makeResult([], [issueComment])

      const updated = applyReactionToResult(result, 'ic1', 'EYES')

      expect(updated.issueComments[0].reactions).toEqual([
        { content: 'EYES', viewerHasReacted: true, count: 1 },
      ])
    })
  })

  describe('when comment ID does not match', () => {
    it('leaves all comments unchanged', () => {
      const comment = makeComment('c1', [
        { content: 'LAUGH', count: 1, viewerHasReacted: false },
      ])
      const result = makeResult([comment])

      const updated = applyReactionToResult(result, 'nonexistent', 'LAUGH')

      expect(updated.threads[0].comments[0].reactions).toEqual([
        { content: 'LAUGH', count: 1, viewerHasReacted: false },
      ])
    })
  })

  describe('preserves other reactions on the same comment', () => {
    it('only modifies the targeted reaction type', () => {
      const comment = makeComment('c1', [
        { content: 'THUMBS_UP', count: 3, viewerHasReacted: false },
        { content: 'HEART', count: 1, viewerHasReacted: true },
      ])
      const result = makeResult([comment])

      const updated = applyReactionToResult(result, 'c1', 'THUMBS_UP')

      expect(updated.threads[0].comments[0].reactions).toEqual([
        { content: 'THUMBS_UP', count: 4, viewerHasReacted: true },
        { content: 'HEART', count: 1, viewerHasReacted: true },
      ])
    })
  })

  describe('immutability', () => {
    it('does not mutate the original result', () => {
      const comment = makeComment('c1', [
        { content: 'HOORAY', count: 1, viewerHasReacted: false },
      ])
      const result = makeResult([comment])

      const updated = applyReactionToResult(result, 'c1', 'HOORAY')

      // Original should be unchanged
      expect(result.threads[0].comments[0].reactions[0].viewerHasReacted).toBe(false)
      expect(result.threads[0].comments[0].reactions[0].count).toBe(1)
      // Updated should be different
      expect(updated.threads[0].comments[0].reactions[0].viewerHasReacted).toBe(true)
      expect(updated.threads[0].comments[0].reactions[0].count).toBe(2)
    })
  })
})
