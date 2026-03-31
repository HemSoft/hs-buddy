import { bench, describe } from 'vitest'
import { applyReactionToResult } from './reactions'
import type {
  PRCommentReactionContent,
  PRReviewComment,
  PRThreadsResult,
} from '../api/github'

function makeComment(id: string): PRReviewComment {
  return {
    id,
    author: 'testuser',
    authorAvatarUrl: null,
    body: 'LGTM',
    bodyHtml: null,
    createdAt: '2026-03-30T12:00:00Z',
    updatedAt: '2026-03-30T12:00:00Z',
    url: `https://github.com/test/repo/pull/1#comment-${id}`,
    diffHunk: '@@ -1,3 +1,4 @@\n code\n+new line',
    reactions: [
      { content: 'THUMBS_UP', count: 2, viewerHasReacted: false },
      { content: 'HEART', count: 1, viewerHasReacted: false },
      { content: 'ROCKET', count: 0, viewerHasReacted: false },
    ],
  }
}

function makeResult(threadCount: number, commentsPerThread: number): PRThreadsResult {
  let commentId = 0
  return {
    threads: Array.from({ length: threadCount }, (_, t) => ({
      id: `thread-${t}`,
      isResolved: false,
      isOutdated: false,
      path: `src/file${t}.ts`,
      line: t * 10 + 1,
      startLine: null,
      diffSide: 'RIGHT',
      comments: Array.from({ length: commentsPerThread }, () =>
        makeComment(`c-${++commentId}`)
      ),
    })),
    issueComments: Array.from({ length: 3 }, () =>
      makeComment(`ic-${++commentId}`)
    ),
  }
}

const SMALL = makeResult(3, 2)     // 3 threads × 2 comments + 3 issue comments = 9
const MEDIUM = makeResult(10, 5)   // 10 threads × 5 comments + 3 issue comments = 53
const LARGE = makeResult(30, 10)   // 30 threads × 10 comments + 3 issue comments = 303

const REACTION: PRCommentReactionContent = 'THUMBS_UP'

describe('applyReactionToResult', () => {
  bench('small PR (9 comments)', () => {
    applyReactionToResult(SMALL, 'c-3', REACTION)
  })

  bench('medium PR (53 comments)', () => {
    applyReactionToResult(MEDIUM, 'c-25', REACTION)
  })

  bench('large PR (303 comments)', () => {
    applyReactionToResult(LARGE, 'c-150', REACTION)
  })

  bench('miss — comment not found', () => {
    applyReactionToResult(MEDIUM, 'nonexistent', REACTION)
  })

  bench('add new reaction type', () => {
    applyReactionToResult(MEDIUM, 'c-10', 'EYES')
  })
})
