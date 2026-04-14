import type { RepoPullRequest } from '../../../api/github'
import type { PullRequest } from '../../../types/pullRequest'

export function getUniqueOrgs(accounts: Array<{ org?: string }>): string[] {
  return (Array.from(new Set(accounts.map(a => a.org))).filter(Boolean) as string[]).sort()
}

export function mapRepoPRToPullRequest(pr: RepoPullRequest, org: string): PullRequest {
  return {
    source: 'GitHub',
    repository: pr.url.split('/')[4] || pr.url,
    id: pr.number,
    title: pr.title,
    author: pr.author,
    authorAvatarUrl: pr.authorAvatarUrl || undefined,
    url: pr.url,
    state: pr.state,
    approvalCount: pr.approvalCount ?? 0,
    assigneeCount: pr.assigneeCount ?? 0,
    iApproved: pr.iApproved ?? false,
    created: pr.createdAt ? new Date(pr.createdAt) : null,
    updatedAt: pr.updatedAt,
    headBranch: pr.headBranch,
    baseBranch: pr.baseBranch,
    date: pr.updatedAt || pr.createdAt,
    org,
  }
}
