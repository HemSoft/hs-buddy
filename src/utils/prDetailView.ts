import type { PullRequest } from '../types/pullRequest'

/** Convert an unknown date-like value to ISO string, or null if invalid/missing. */
function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const d = new Date(value as string | number | Date)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

function orEmpty(val: string | undefined): string {
  return val || ''
}

function nullIfUndefined(val: number | null | undefined): number | null {
  return val ?? null
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
  reviewStateKnown?: boolean
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
    reviewStateKnown: pr.reviewStateKnown,
    created: toIsoOrNull(pr.created),
    updatedAt: pr.updatedAt || null,
    headBranch: orEmpty(pr.headBranch),
    baseBranch: orEmpty(pr.baseBranch),
    date: pr.date,
    orgAvatarUrl: pr.orgAvatarUrl,
    org: pr.org,
    threadsTotal: nullIfUndefined(pr.threadsTotal),
    threadsUnaddressed: nullIfUndefined(pr.threadsUnaddressed),
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

type FieldValidator = (value: unknown) => boolean

const isString: FieldValidator = value => typeof value === 'string'
const isNumber: FieldValidator = value => typeof value === 'number'
const isBoolean: FieldValidator = value => typeof value === 'boolean'

function optional(validate: FieldValidator): FieldValidator {
  return value => value === undefined || validate(value)
}

function nullable(validate: FieldValidator): FieldValidator {
  return value => value === null || validate(value)
}

// Keep the runtime boundary complete when PRDetailInfo gains another field.
const PR_DETAIL_FIELDS = {
  source: isString,
  repository: isString,
  id: isNumber,
  title: isString,
  author: isString,
  authorAvatarUrl: optional(isString),
  url: isString,
  state: isString,
  approvalCount: isNumber,
  assigneeCount: isNumber,
  iApproved: isBoolean,
  reviewStateKnown: optional(isBoolean),
  created: nullable(isString),
  updatedAt: optional(nullable(isString)),
  headBranch: optional(isString),
  baseBranch: optional(isString),
  date: nullable(isString),
  orgAvatarUrl: optional(isString),
  org: optional(isString),
  threadsTotal: optional(nullable(isNumber)),
  threadsUnaddressed: optional(nullable(isNumber)),
} satisfies Record<keyof PRDetailInfo, FieldValidator>

function isPRDetailInfo(value: unknown): value is PRDetailInfo {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return Object.entries(PR_DETAIL_FIELDS).every(([field, validate]) => validate(record[field]))
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

    const parsed: unknown = JSON.parse(decodeURIComponent(encoded))
    if (!isPRDetailInfo(parsed)) return null
    const pr = parsed
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
