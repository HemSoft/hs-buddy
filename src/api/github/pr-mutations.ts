import type { PRConfig } from '../../types/pullRequest'
import {
  type PRCommentReactionContent,
  type PRReviewComment,
  graphql,
  getOctokitForOwner,
  getTokenForOwner,
  mapUserAuthorFields,
} from './shared'

export async function addPRComment(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
): Promise<PRReviewComment> {
  const octokit = await getOctokitForOwner(config, owner)
  const response = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body,
  })
  const c = response.data
  return {
    id: c.node_id || String(c.id),
    ...mapUserAuthorFields(c.user),
    body: c.body || '',
    bodyHtml: null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    url: c.html_url,
    diffHunk: null,
    reactions: [],
  }
}

export async function addCommentReaction(
  config: PRConfig['github'],
  owner: string,
  subjectId: string,
  content: PRCommentReactionContent
): Promise<void> {
  const token = await getTokenForOwner(config, owner)
  const mutation = `
    mutation AddCommentReaction($subjectId: ID!, $content: ReactionContent!) {
      addReaction(input: { subjectId: $subjectId, content: $content }) { reaction { content } }
    }
  `
  await graphql<unknown>(mutation, {
    subjectId,
    content,
    headers: { authorization: `token ${token}` },
  })
}

export async function approvePullRequest(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number,
  body = 'Approved'
): Promise<void> {
  const octokit = await getOctokitForOwner(config, owner)
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    event: 'APPROVE',
    body,
  })
}

export async function requestCopilotReview(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number
): Promise<void> {
  const octokit = await getOctokitForOwner(config, owner)
  await octokit.pulls.requestReviewers({
    owner,
    repo,
    pull_number: pullNumber,
    reviewers: ['copilot-pull-request-reviewer[bot]'],
  })
}

/* v8 ignore start -- API response null-guards in review listing */
export async function listPRReviews(
  config: PRConfig['github'],
  owner: string,
  repo: string,
  pullNumber: number
): Promise<
  { id: number; user: { login: string } | null; state: string; submitted_at: string | null }[]
> {
  const octokit = await getOctokitForOwner(config, owner)
  const data = await octokit.paginate(octokit.pulls.listReviews, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  })
  return data.map(r => ({
    id: r.id,
    user: r.user ? { login: r.user.login } : null,
    state: r.state,
    submitted_at: r.submitted_at ?? null,
  }))
}
/* v8 ignore stop */
