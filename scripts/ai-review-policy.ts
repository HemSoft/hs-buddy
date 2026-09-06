export const REVIEW_CHECK = 'ai-review-accepted'
export const CODEX_ACTOR_ID = 199175422
export const MERGE_APP_ID = 4448946

export interface Actor {
  id: number
  login: string
}

export interface ReviewComment {
  id: number
  user: Actor
  body: string
  created_at: string
  updated_at: string
}

export interface Review {
  user: Actor
  body: string
  state: string
  commit_id: string
  submitted_at: string | null
}

export interface Pull {
  number: number
  node_id: string
  state: string
  draft: boolean
  commits: number
  head: { sha: string; repo: { full_name: string } | null }
  base: { ref: string }
  labels: Array<{ name: string }>
  auto_merge: { merge_method: string } | null
}

export interface ReviewSnapshot {
  pull: Pull
  commitShas: string[]
  comments: ReviewComment[]
  reviews: Review[]
  reactions: Array<{ content: string; user: Actor; created_at: string }>
  unresolvedThreads: number
  reviewDecision: string | null
  observedHead: string
  sharedHead: boolean
}

interface Receipt {
  prefix: string
  completedAt: number
  commentId: number
}

function isCodex(actor: Actor): boolean {
  return actor.id === CODEX_ACTOR_ID && actor.login === 'chatgpt-codex-connector[bot]'
}

function summaryReceipt(
  comment: ReviewComment,
  reactions: ReviewSnapshot['reactions']
): Receipt | null {
  if (!comment.body.startsWith('<!-- codex-pull-request-review-summary -->')) {
    return null
  }
  const row = comment.body.match(
    /^\|[^|\n]*\*\*Code Review\*\*[^|\n]*\|\s*✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">[^<]*<\/relative-time>\s*\|\s*`([a-f0-9]{7,40})`\s*\|/m
  )
  if (!row) return null
  const completedAt = Date.parse(row[1])
  const thumbsUp = reactions.some(
    reaction =>
      reaction.content === '+1' &&
      isCodex(reaction.user) &&
      Date.parse(reaction.created_at) >= completedAt
  )
  return thumbsUp ? { prefix: row[2], completedAt, commentId: comment.id } : null
}

function cleanReceipt(comment: ReviewComment): Receipt | null {
  if (!comment.body.startsWith("Codex Review: Didn't find any major issues.")) return null
  const commit = comment.body.match(/\*\*Reviewed commit:\*\* `([a-f0-9]{7,40})`/)
  if (!commit) return null
  return { prefix: commit[1], completedAt: Date.parse(comment.created_at), commentId: comment.id }
}

function latestReceipt(snapshot: ReviewSnapshot): Receipt | null {
  const comments = snapshot.comments
    .filter(comment => isCodex(comment.user))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  const latest = comments[0]
  if (!latest) return null
  return summaryReceipt(latest, snapshot.reactions) ?? cleanReceipt(latest)
}

function matchesHead(receipt: Receipt, snapshot: ReviewSnapshot): boolean {
  const matches = snapshot.commitShas.filter(sha => sha.startsWith(receipt.prefix))
  return matches.length === 1 && matches[0] === snapshot.pull.head.sha
}

function newerReviewExists(snapshot: ReviewSnapshot, receipt: Receipt): boolean {
  return snapshot.reviews.some(
    review =>
      isCodex(review.user) &&
      review.commit_id === snapshot.pull.head.sha &&
      Date.parse(review.submitted_at ?? '') > receipt.completedAt
  )
}

function hasChangeRequest(reviews: Review[]): boolean {
  const states = new Map<number, string>()
  const decisions = reviews
    .filter(review => ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state))
    .sort((a, b) => Date.parse(a.submitted_at ?? '') - Date.parse(b.submitted_at ?? ''))
  for (const review of decisions) states.set(review.user.id, review.state)
  return [...states.values()].includes('CHANGES_REQUESTED')
}

export function evaluateReview(snapshot: ReviewSnapshot): { accepted: boolean; reason: string } {
  const { pull } = snapshot
  const holds = new Set(pull.labels.map(label => label.name))
  const blockers: Array<[boolean, string]> = [
    [pull.state !== 'open' || pull.draft, 'PR is closed or draft'],
    [pull.base.ref !== 'main', 'PR does not target main'],
    [holds.has('automerge:hold'), 'Explicit automerge:hold label'],
    [snapshot.observedHead !== pull.head.sha, 'Head changed during observation'],
    [snapshot.commitShas.length !== pull.commits, 'Incomplete PR commit history'],
    [snapshot.sharedHead, 'Another open PR shares this commit; check contexts would be ambiguous'],
    [snapshot.unresolvedThreads !== 0, 'Unresolved review threads'],
    [
      snapshot.reviewDecision === 'CHANGES_REQUESTED' || hasChangeRequest(snapshot.reviews),
      'Changes requested',
    ],
  ]
  const blocker = blockers.find(([blocked]) => blocked)
  if (blocker) return { accepted: false, reason: blocker[1] }
  const receipt = latestReceipt(snapshot)
  if (!receipt || !Number.isFinite(receipt.completedAt)) {
    return { accepted: false, reason: 'No completed, trusted Codex clean receipt' }
  }
  if (!matchesHead(receipt, snapshot)) {
    return { accepted: false, reason: 'Review commit is stale or ambiguous' }
  }
  if (newerReviewExists(snapshot, receipt)) {
    return { accepted: false, reason: 'A newer Codex review needs a clean receipt' }
  }
  return { accepted: true, reason: `Codex clean receipt ${receipt.commentId} for ${pull.head.sha}` }
}

export function eligibleForAutoMerge(snapshot: ReviewSnapshot, repository: string): boolean {
  return (
    snapshot.pull.head.repo?.full_name === repository &&
    snapshot.pull.labels.some(label => label.name === 'automerge') &&
    evaluateReview(snapshot).accepted
  )
}
