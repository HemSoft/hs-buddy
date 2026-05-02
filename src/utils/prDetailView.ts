import type { PullRequest } from '../types/pullRequest'

/** Convert an unknown date-like value to ISO string, or null if invalid/missing. */
function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const d = new Date(value as string | number | Date)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

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
  threadsTotal?: number | null
  threadsUnaddressed?: number | null
}

export type PRDetailSection = 'conversation' | 'commits' | 'checks' | 'files-changed' | 'ai-reviews'

interface PRDetailRoute {
  pr: PRDetailInfo
  section: PRDetailSection | null
}

function buildPRDetailInfo(pr: PullRequest): PRDetailInfo {
  return {
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
    created: toIsoOrNull(pr.created),
    updatedAt: pr.updatedAt || null,
    headBranch: pr.headBranch || '',
    baseBranch: pr.baseBranch || '',
    date: pr.date,
    orgAvatarUrl: pr.orgAvatarUrl,
    org: pr.org,
    threadsTotal: pr.threadsTotal ?? null,
    threadsUnaddressed: pr.threadsUnaddressed ?? null,
  }
}

export function createPRDetailViewId(
  pr: PullRequest,
  section: PRDetailSection | null = null
): string {
  const info = buildPRDetailInfo(pr)
  const base = `pr-detail:${encodeURIComponent(JSON.stringify(info))}`
  return section ? `${base}?section=${section}` : base
}

export function parsePRDetailRoute(viewId: string): PRDetailRoute | null {
  const prefix = 'pr-detail:'
  if (!viewId.startsWith(prefix)) {
    return null
  }

  const VALID_SECTIONS: PRDetailSection[] = [
    'conversation',
    'commits',
    'checks',
    'files-changed',
    'ai-reviews',
  ]

  try {
    const [encoded, sectionPart] = viewId.slice(prefix.length).split('?section=')
    if (!encoded) {
      return null
    }

    const pr = JSON.parse(decodeURIComponent(encoded)) as PRDetailInfo
    const section = VALID_SECTIONS.includes(sectionPart as PRDetailSection)
      ? (sectionPart as PRDetailSection)
      : null

    return { pr, section }
  } catch (_: unknown) {
    return null
  }
}

export function resolveHeadBranch(
  branches: { headBranch: string; baseBranch: string } | null,
  headBranch: string | undefined
): string | undefined {
  return branches?.headBranch || headBranch
}

export function parseIssueFromBranch(branch: string | undefined): number | null {
  const match = branch?.match(/issue-(\d+)/)
  return match ? Number(match[1]) : null
}
