// Used by SFL workflows via Convex HTTP API, not by the Electron renderer.
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import {
  normalizeWhitespace,
  toCanonicalKey,
  sourceToLabel,
  ensureAcceptanceCriteria,
  validateIntakeInput,
  buildIssueTitle,
  buildIssueBody,
} from '../shared/utils/featureIntakeUtils'

const intakeSourceValidator = v.union(
  v.literal('jira'),
  v.literal('github-issue'),
  v.literal('manual'),
  v.literal('other')
)

const riskLabelValidator = v.union(
  v.literal('risk:trivial'),
  v.literal('risk:low'),
  v.literal('risk:medium'),
  v.literal('risk:high'),
  v.literal('risk:critical')
)

const intakeStatusValidator = v.union(
  v.literal('draft'),
  v.literal('linked'),
  v.literal('duplicate')
)

export const list = query({
  args: {},
  handler: async ctx => {
    return ctx.db.query('featureIntakes').withIndex('by_created').order('desc').collect()
  },
})

export const listByStatus = query({
  args: {
    status: intakeStatusValidator,
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query('featureIntakes')
      .withIndex('by_status', q => q.eq('status', args.status))
      .order('desc')
      .collect()
  },
})

export const get = query({
  args: {
    id: v.id('featureIntakes'),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id)
  },
})

export const getBySourceExternal = query({
  args: {
    source: intakeSourceValidator,
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query('featureIntakes')
      .withIndex('by_source_external', q =>
        q.eq('source', args.source).eq('externalId', args.externalId)
      )
      .first()
  },
})

function buildNormalizeResult(
  intakeId: Id<'featureIntakes'>,
  existingByCanonical: {
    _id: Id<'featureIntakes'>
    canonicalIssueNumber?: number
    canonicalIssueUrl?: string
  } | null,
  canonicalKey: string,
  canonicalIssueTitle: string,
  canonicalIssueBody: string,
  canonicalIssueLabels: string[]
) {
  return {
    intakeId,
    status: existingByCanonical ? ('deduped' as const) : ('created' as const),
    canonicalKey,
    canonicalIssueTitle,
    canonicalIssueBody,
    canonicalIssueLabels,
    duplicateOfId: existingByCanonical?._id,
  }
}

function buildExternalDuplicateResult(existing: {
  _id: Id<'featureIntakes'>
  canonicalKey: string
  canonicalIssueTitle: string
  canonicalIssueBody: string
  canonicalIssueLabels: string[]
}) {
  return {
    intakeId: existing._id,
    status: 'existing-external' as const,
    canonicalKey: existing.canonicalKey,
    canonicalIssueTitle: existing.canonicalIssueTitle,
    canonicalIssueBody: existing.canonicalIssueBody,
    canonicalIssueLabels: existing.canonicalIssueLabels,
  }
}

type IntakeSource = 'jira' | 'github-issue' | 'manual' | 'other'
type RiskLabel = 'risk:trivial' | 'risk:low' | 'risk:medium' | 'risk:high' | 'risk:critical'

function resolveRiskLabel(riskLabel: RiskLabel | undefined): RiskLabel {
  return riskLabel ?? 'risk:low'
}

function getExistingCanonicalFields(
  existingByCanonical: {
    _id: Id<'featureIntakes'>
    canonicalIssueNumber?: number
    canonicalIssueUrl?: string
  } | null
): {
  duplicateOfId?: Id<'featureIntakes'>
  canonicalIssueNumber?: number
  canonicalIssueUrl?: string
} {
  if (!existingByCanonical) {
    return {
      duplicateOfId: undefined,
      canonicalIssueNumber: undefined,
      canonicalIssueUrl: undefined,
    }
  }
  return {
    duplicateOfId: existingByCanonical._id,
    canonicalIssueNumber: existingByCanonical.canonicalIssueNumber,
    canonicalIssueUrl: existingByCanonical.canonicalIssueUrl,
  }
}

function buildFeatureIntakeInsertDoc(
  normalizedArgs: {
    source: IntakeSource
    externalId: string
    externalUrl?: string
    requestedBy?: string
    title: string
    problem: string
    requestedOutcome?: string
    acceptanceCriteria: string[]
    riskLabel?: RiskLabel
    metadata?: unknown
  },
  existingByCanonical: {
    _id: Id<'featureIntakes'>
    canonicalIssueNumber?: number
    canonicalIssueUrl?: string
  } | null,
  canonicalData: {
    canonicalKey: string
    canonicalIssueTitle: string
    canonicalIssueBody: string
    canonicalIssueLabels: string[]
    riskLabel: RiskLabel
  },
  now: number
) {
  const status: 'draft' | 'duplicate' = existingByCanonical ? 'duplicate' : 'draft'
  return {
    source: normalizedArgs.source,
    externalId: normalizedArgs.externalId,
    externalUrl: normalizedArgs.externalUrl,
    requestedBy: normalizedArgs.requestedBy,
    title: normalizedArgs.title,
    problem: normalizedArgs.problem,
    requestedOutcome: normalizedArgs.requestedOutcome,
    acceptanceCriteria: normalizedArgs.acceptanceCriteria,
    riskLabel: canonicalData.riskLabel,
    canonicalKey: canonicalData.canonicalKey,
    canonicalIssueTitle: canonicalData.canonicalIssueTitle,
    canonicalIssueBody: canonicalData.canonicalIssueBody,
    canonicalIssueLabels: canonicalData.canonicalIssueLabels,
    status,
    metadata: normalizedArgs.metadata,
    createdAt: now,
    updatedAt: now,
    ...getExistingCanonicalFields(existingByCanonical),
  }
}

async function insertAndResolve(
  ctx: MutationCtx,
  normalizedArgs: {
    source: IntakeSource
    externalId: string
    externalUrl?: string
    requestedBy?: string
    title: string
    problem: string
    requestedOutcome?: string
    acceptanceCriteria: string[]
    riskLabel?: RiskLabel
    metadata?: unknown
  }
) {
  const { source, externalId, title, problem, requestedOutcome, acceptanceCriteria } =
    normalizedArgs

  const canonicalKey = toCanonicalKey({
    source,
    title,
    problem,
    requestedOutcome,
    acceptanceCriteria,
  })

  const existingByCanonical = await ctx.db
    .query('featureIntakes')
    .withIndex('by_canonical_key', q => q.eq('canonicalKey', canonicalKey))
    .first()

  const riskLabel = resolveRiskLabel(normalizedArgs.riskLabel)
  const canonicalIssueTitle = buildIssueTitle(title)
  const canonicalIssueLabels = ['agent:fixable', sourceToLabel(source), riskLabel]

  const canonicalIssueBody = buildIssueBody({
    source,
    externalId,
    externalUrl: normalizedArgs.externalUrl,
    requestedBy: normalizedArgs.requestedBy,
    title,
    problem,
    requestedOutcome,
    acceptanceCriteria,
    canonicalKey,
    riskLabel,
  })

  const now = Date.now()

  const intakeId = await ctx.db.insert(
    'featureIntakes',
    buildFeatureIntakeInsertDoc(
      normalizedArgs,
      existingByCanonical,
      {
        canonicalKey,
        canonicalIssueTitle,
        canonicalIssueBody,
        canonicalIssueLabels,
        riskLabel,
      },
      now
    )
  )

  return buildNormalizeResult(
    intakeId,
    existingByCanonical,
    canonicalKey,
    canonicalIssueTitle,
    canonicalIssueBody,
    canonicalIssueLabels
  )
}

export const normalize = mutation({
  args: {
    source: intakeSourceValidator,
    externalId: v.string(),
    title: v.string(),
    problem: v.string(),
    requestedOutcome: v.optional(v.string()),
    acceptanceCriteria: v.optional(v.array(v.string())),
    externalUrl: v.optional(v.string()),
    requestedBy: v.optional(v.string()),
    riskLabel: v.optional(riskLabelValidator),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const externalId = normalizeWhitespace(args.externalId)
    const title = normalizeWhitespace(args.title)
    const problem = normalizeWhitespace(args.problem)

    validateIntakeInput(externalId, title, problem)

    const existingByExternal = await ctx.db
      .query('featureIntakes')
      .withIndex('by_source_external', q =>
        q.eq('source', args.source).eq('externalId', externalId)
      )
      .first()

    if (existingByExternal) {
      return buildExternalDuplicateResult(existingByExternal)
    }

    const acceptanceCriteria = ensureAcceptanceCriteria(args.acceptanceCriteria)
    const requestedOutcome = args.requestedOutcome
      ? normalizeWhitespace(args.requestedOutcome)
      : undefined

    return insertAndResolve(ctx, {
      ...args,
      externalId,
      title,
      problem,
      requestedOutcome,
      acceptanceCriteria,
    })
  },
})

export const linkCanonicalIssue = mutation({
  args: {
    id: v.id('featureIntakes'),
    issueNumber: v.number(),
    issueUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id)
    if (!existing) {
      throw new Error(`Feature intake ${args.id} not found`)
    }

    const now = Date.now()

    await ctx.db.patch(args.id, {
      status: 'linked',
      canonicalIssueNumber: args.issueNumber,
      canonicalIssueUrl: args.issueUrl,
      updatedAt: now,
    })

    return args.id
  },
})
