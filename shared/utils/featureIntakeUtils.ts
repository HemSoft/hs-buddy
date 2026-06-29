/**
 * Feature intake helpers — pure functions extracted from convex/featureIntakes.ts.
 */

/** Collapse runs of whitespace into single spaces and trim. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Convert a value to a URL-safe canonical fragment. */
export function toCanonicalFragment(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Build a deterministic key for deduplication from intake fields. */
export function toCanonicalKey(input: {
  source: string
  title: string
  problem: string
  requestedOutcome?: string
  acceptanceCriteria: string[]
}): string {
  const criteriaFragment = input.acceptanceCriteria
    .map(criterion => toCanonicalFragment(criterion))
    .join('-')

  const joined = [
    input.source,
    toCanonicalFragment(input.title),
    toCanonicalFragment(input.problem),
    toCanonicalFragment(input.requestedOutcome ?? ''),
    criteriaFragment,
  ]
    .filter(Boolean)
    .join('-')

  return `fi-${joined}`.slice(0, 220)
}

/** Map an intake source to a GitHub label. */
export function sourceToLabel(source: string): string {
  return `source:${source}`
}

/** Deduplicate and normalize acceptance criteria. */
export function toUniqueCriteria(criteria: string[]): string[] {
  const seen = new Set<string>()
  const cleaned: string[] = []

  for (const criterion of criteria) {
    const normalized = normalizeWhitespace(criterion)
    if (!normalized) continue

    const lookupKey = normalized.toLowerCase()
    if (seen.has(lookupKey)) continue

    seen.add(lookupKey)
    cleaned.push(normalized)
  }

  return cleaned
}

/** Ensure at least one acceptance criterion exists. */
export function ensureAcceptanceCriteria(raw?: string[]): string[] {
  const criteria = toUniqueCriteria(raw ?? [])
  if (criteria.length === 0) {
    criteria.push('Acceptance criteria to be refined during triage.')
  }
  return criteria
}

/** Validate required intake fields. Throws if any are empty. */
export function validateIntakeInput(externalId: string, title: string, problem: string): void {
  if (!externalId) throw new Error('externalId is required')
  if (!title) throw new Error('title is required')
  if (!problem) throw new Error('problem is required')
}

/** Build the GitHub issue title with [feature-intake] prefix. */
export function buildIssueTitle(title: string): string {
  const normalized = normalizeWhitespace(title)
  return normalized.startsWith('[feature-intake]') ? normalized : `[feature-intake] ${normalized}`
}

/** Build the GitHub issue body from intake data. */
export function buildIssueBody(input: {
  source: string
  externalId: string
  externalUrl?: string
  requestedBy?: string
  title: string
  problem: string
  requestedOutcome?: string
  acceptanceCriteria: string[]
  canonicalKey: string
  riskLabel: string
}): string {
  const criteriaChecklist = input.acceptanceCriteria
    .map(criterion => `- [ ] ${criterion}`)
    .join('\n')

  const outcome = input.requestedOutcome
    ? normalizeWhitespace(input.requestedOutcome)
    : 'Define desired user/business outcome during triage.'

  const sourceUrlLine = input.externalUrl ? `- Source URL: ${input.externalUrl}` : ''
  const requesterLine = input.requestedBy
    ? `- Requested by: ${normalizeWhitespace(input.requestedBy)}`
    : ''

  return [
    '## Summary',
    normalizeWhitespace(input.title),
    '',
    '## Problem',
    normalizeWhitespace(input.problem),
    '',
    '## Requested Outcome',
    outcome,
    '',
    '## Acceptance Criteria',
    criteriaChecklist,
    '',
    '## Source Metadata',
    `- Source: ${sourceToLabel(input.source)}`,
    `- External ID: ${normalizeWhitespace(input.externalId)}`,
    sourceUrlLine,
    requesterLine,
    `- Risk Class: ${input.riskLabel}`,
    '',
    '## Agent Metadata',
    '- Lifecycle: agent:fixable',
    `- Idempotency key: ${input.canonicalKey}`,
    '',
    `<!-- buddy:feature-intake-key:${input.canonicalKey} -->`,
  ]
    .filter(line => line !== '')
    .join('\n')
}
