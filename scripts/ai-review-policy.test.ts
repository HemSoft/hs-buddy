import { describe, expect, it } from 'vitest'
import {
  CODEX_ACTOR_ID,
  eligibleForAutoMerge,
  evaluateReview,
  type ReviewSnapshot,
} from './ai-review-policy'

const head = 'a'.repeat(40)
const bot = { id: CODEX_ACTOR_ID, login: 'chatgpt-codex-connector[bot]' }
const completed = '2026-09-06T16:55:01Z'

function snapshot(): ReviewSnapshot {
  return {
    pull: {
      number: 1,
      node_id: 'PR_1',
      state: 'open',
      draft: false,
      commits: 1,
      head: { sha: head, repo: { full_name: 'HemSoft/hs-buddy' } },
      base: { ref: 'main' },
      labels: [{ name: 'automerge' }],
      auto_merge: null,
    },
    observedHead: head,
    commitShas: [head],
    unresolvedThreads: 0,
    reviewDecision: null,
    sharedHead: false,
    comments: [
      {
        id: 7,
        user: bot,
        created_at: completed,
        updated_at: completed,
        body: `<!-- codex-pull-request-review-summary -->\n| 📝 **Code Review** | ✅ **Completed** <relative-time datetime="${completed}">${completed}</relative-time> | \`aaaaaaa\` | PR opened |`,
      },
    ],
    reactions: [{ user: bot, content: '+1', created_at: '2026-09-06T16:55:06Z' }],
    reviews: [],
  }
}

const blockers: Array<[string, (s: ReviewSnapshot) => void]> = [
  [
    'unresolved thread',
    (s: ReviewSnapshot) => {
      s.unresolvedThreads = 1
    },
  ],
  [
    'draft',
    (s: ReviewSnapshot) => {
      s.pull.draft = true
    },
  ],
  [
    'closed',
    (s: ReviewSnapshot) => {
      s.pull.state = 'closed'
    },
  ],
  [
    'different base',
    (s: ReviewSnapshot) => {
      s.pull.base.ref = 'release'
    },
  ],
  [
    'hold',
    (s: ReviewSnapshot) => {
      s.pull.labels.push({ name: 'automerge:hold' })
    },
  ],
  [
    'head changed',
    (s: ReviewSnapshot) => {
      s.observedHead = 'b'.repeat(40)
    },
  ],
  [
    'stale review',
    (s: ReviewSnapshot) => {
      s.pull.head.sha = 'b'.repeat(40)
      s.observedHead = s.pull.head.sha
      s.commitShas = [s.pull.head.sha]
    },
  ],
  [
    'missing commit page',
    (s: ReviewSnapshot) => {
      s.pull.commits = 2
    },
  ],
  [
    'shared head',
    (s: ReviewSnapshot) => {
      s.sharedHead = true
    },
  ],
  [
    'ambiguous abbreviation',
    (s: ReviewSnapshot) => {
      s.commitShas.push('aaaaaaa' + 'b'.repeat(33))
      s.pull.commits = 2
    },
  ],
  [
    'changes requested',
    (s: ReviewSnapshot) => {
      s.reviewDecision = 'CHANGES_REQUESTED'
    },
  ],
  [
    'missing reaction',
    (s: ReviewSnapshot) => {
      s.reactions = []
    },
  ],
  [
    'untrusted reaction',
    (s: ReviewSnapshot) => {
      s.reactions[0].user = { ...bot, id: 9 }
    },
  ],
  [
    'stale thumbs-up from an earlier review',
    (s: ReviewSnapshot) => {
      s.reactions[0].created_at = '2026-09-06T16:50:00Z'
    },
  ],
  [
    'invalid reaction timestamp',
    (s: ReviewSnapshot) => {
      s.reactions[0].created_at = 'unknown'
    },
  ],
  [
    'spoofed comment',
    (s: ReviewSnapshot) => {
      s.comments[0].user = { ...bot, id: 9 }
    },
  ],
  [
    'wrong login',
    (s: ReviewSnapshot) => {
      s.comments[0].user = { ...bot, login: 'some-bot' }
    },
  ],
  [
    'running review',
    (s: ReviewSnapshot) => {
      s.comments[0].body = s.comments[0].body.replace('✅ **Completed**', '🔄 **Running**')
    },
  ],
  [
    'missing receipt',
    (s: ReviewSnapshot) => {
      s.comments = []
    },
  ],
  [
    'invalid timestamp',
    (s: ReviewSnapshot) => {
      s.comments[0].body = s.comments[0].body.replaceAll(completed, 'invalid')
    },
  ],
]

describe('required AI acceptance', () => {
  it('accepts a trusted completed summary and bot thumbs-up for the unique current head', () => {
    expect(evaluateReview(snapshot()).accepted).toBe(true)
    expect(eligibleForAutoMerge(snapshot(), 'HemSoft/hs-buddy')).toBe(true)
  })

  it.each(blockers)('blocks %s', (_name, change) => {
    const data = snapshot()
    change(data)
    expect(evaluateReview(data).accepted).toBe(false)
    expect(eligibleForAutoMerge(data, 'HemSoft/hs-buddy')).toBe(false)
  })

  it('accepts the observed standalone clean receipt without a reaction', () => {
    const data = snapshot()
    data.comments[0].body = `Codex Review: Didn't find any major issues. Chef's kiss.\n\n**Reviewed commit:** \`${head}\``
    data.reactions = []
    expect(evaluateReview(data).accepted).toBe(true)
    data.comments[0].body = "Codex Review: Didn't find any major issues."
    expect(evaluateReview(data).accepted).toBe(false)
  })

  it('does not revive an old clean receipt when the latest bot activity is running or unknown', () => {
    const data = snapshot()
    data.comments.push({
      ...data.comments[0],
      id: 8,
      updated_at: '2026-09-06T17:00:00Z',
      body: 'Review running',
    })
    expect(evaluateReview(data).accepted).toBe(false)
  })

  it('blocks a newer current-head review even after its thread was resolved', () => {
    const data = snapshot()
    data.reviews.push({
      user: bot,
      state: 'COMMENTED',
      body: 'Finding',
      commit_id: head,
      submitted_at: '2026-09-06T17:00:00Z',
    })
    expect(evaluateReview(data).accepted).toBe(false)
    data.reviews[0].submitted_at = '2026-09-06T16:50:00Z'
    expect(evaluateReview(data).accepted).toBe(true)
  })

  it('permits reviewed manual PRs but never opts them into auto-merge', () => {
    const data = snapshot()
    data.pull.labels = []
    expect(evaluateReview(data).accepted).toBe(true)
    expect(eligibleForAutoMerge(data, 'HemSoft/hs-buddy')).toBe(false)
  })

  it('never auto-enrolls a fork or deleted head repository', () => {
    const data = snapshot()
    data.pull.head.repo = { full_name: 'someone/fork' }
    expect(eligibleForAutoMerge(data, 'HemSoft/hs-buddy')).toBe(false)
    data.pull.head.repo = null
    expect(eligibleForAutoMerge(data, 'HemSoft/hs-buddy')).toBe(false)
  })
})

describe('human review decisions', () => {
  it('blocks an undismissed change request when aggregate reviewDecision is absent', () => {
    const data = snapshot()
    const human = { id: 9, login: 'maintainer' }
    data.reviews.push({
      user: human,
      body: 'Needs a fix',
      state: 'CHANGES_REQUESTED',
      commit_id: head,
      submitted_at: completed,
    })
    expect(evaluateReview(data).accepted).toBe(false)
    data.reviews.push({
      user: human,
      body: 'Following up',
      state: 'COMMENTED',
      commit_id: head,
      submitted_at: '2026-09-06T17:00:00Z',
    })
    expect(evaluateReview(data).accepted).toBe(false)
    data.reviews.push({
      user: human,
      body: 'Fixed',
      state: 'APPROVED',
      commit_id: head,
      submitted_at: '2026-09-06T17:10:00Z',
    })
    expect(evaluateReview(data).accepted).toBe(true)
  })
})
