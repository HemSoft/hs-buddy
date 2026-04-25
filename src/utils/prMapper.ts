import type { RepoPullRequest } from '../api/github'
import type { PullRequest } from '../types/pullRequest'

function withPRDefaults(pr: RepoPullRequest) {
  return {
    approvalCount: pr.approvalCount ?? 0,
    assigneeCount: pr.assigneeCount ?? 0,
    iApproved: pr.iApproved ?? false,
  }
}

/** Maps a repo-scoped PR API response to the app-wide PullRequest type. */
export function mapRepoPRToPullRequest(pr: RepoPullRequest, org: string): PullRequest {
  const { approvalCount, assigneeCount, iApproved } = withPRDefaults(pr)
  const created = pr.createdAt ? new Date(pr.createdAt) : null
  return {
    source: 'GitHub',
    repository: pr.url.split('/')[4] || pr.url,
    id: pr.number,
    title: pr.title,
    author: pr.author,
    authorAvatarUrl: pr.authorAvatarUrl || undefined,
    url: pr.url,
    state: pr.state,
    approvalCount,
    assigneeCount,
    iApproved,
    created,
    updatedAt: pr.updatedAt,
    headBranch: pr.headBranch,
    baseBranch: pr.baseBranch,
    date: pr.updatedAt || pr.createdAt,
    org,
  }
}
