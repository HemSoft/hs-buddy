import type { PullRequest } from '../types/pullRequest'

export interface PRDetailInfo {
  source: PullRequest['source']
  repository: string
  id: number
  title: string
  author: string
  authorAvatarUrl?: string
  url: string
  state: string
  approvalCount: number
  assigneeCount: number
  iApproved: boolean
  created: string | null
  updatedAt?: string | null
  headBranch?: string
  baseBranch?: string
  date: string | null
  orgAvatarUrl?: string
  org?: string
}

export interface PRLinkInfo extends PRDetailInfo {}

export type PRDetailSection = 'conversation' | 'commits' | 'checks' | 'files-changed'

export interface PRDetailRoute {
  pr: PRDetailInfo
  section: PRDetailSection | null
}

export function createPRDetailViewId(
  pr: PullRequest,
  section: PRDetailSection | null = null
): string {
  const createdDate = pr.created ? new Date(pr.created as unknown as string | number | Date) : null
  const createdIso = createdDate && Number.isFinite(createdDate.getTime())
    ? createdDate.toISOString()
    : null

  const info: PRLinkInfo = {
    source: pr.source,
    repository: pr.repository,
    id: pr.id,
    title: pr.title,
    author: pr.author,
    authorAvatarUrl: pr.authorAvatarUrl,
    url: pr.url,
    state: pr.state,
    approvalCount: pr.approvalCount,
    assigneeCount: pr.assigneeCount,
    iApproved: pr.iApproved,
    created: createdIso,
    updatedAt: pr.updatedAt || null,
    headBranch: pr.headBranch || '',
    baseBranch: pr.baseBranch || '',
    date: pr.date,
    orgAvatarUrl: pr.orgAvatarUrl,
    org: pr.org,
  }

  const base = `pr-detail:${encodeURIComponent(JSON.stringify(info))}`
  return section ? `${base}?section=${section}` : base
}

export function parsePRLinkInfo(viewId: string): PRLinkInfo | null {
  const prefix = 'pr-detail:'
  if (!viewId.startsWith(prefix)) {
    return null
  }

  try {
    const encoded = viewId.replace(prefix, '').split('?section=')[0]
    if (!encoded) return null
    return JSON.parse(decodeURIComponent(encoded)) as PRLinkInfo
  } catch {
    return null
  }
}

export function parsePRDetailRoute(viewId: string): PRDetailRoute | null {
  const pr = parsePRLinkInfo(viewId)
  if (!pr) {
    return null
  }

  const sectionPart = viewId.split('?section=')[1]
  const section = sectionPart as PRDetailSection | undefined
  const validSection =
    section === 'conversation' ||
    section === 'commits' ||
    section === 'checks' ||
    section === 'files-changed'
      ? section
      : null

  return { pr, section: validSection }
}

export function parsePRDetailViewId(viewId: string): PRDetailInfo | null {
  return parsePRLinkInfo(viewId)
}
