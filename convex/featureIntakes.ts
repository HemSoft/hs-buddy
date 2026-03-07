// Used by SFL workflows via Convex HTTP API, not by the Electron renderer.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const intakeSourceValidator = v.union(
  v.literal("jira"),
  v.literal("github-issue"),
  v.literal("manual"),
  v.literal("other")
);

const riskLabelValidator = v.union(
  v.literal("risk:trivial"),
  v.literal("risk:low"),
  v.literal("risk:medium"),
  v.literal("risk:high"),
  v.literal("risk:critical")
);

const intakeStatusValidator = v.union(
  v.literal("draft"),
  v.literal("linked"),
  v.literal("duplicate")
);

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const toCanonicalFragment = (value: string): string =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toCanonicalKey = (input: {
  source: "jira" | "github-issue" | "manual" | "other";
  title: string;
  problem: string;
  requestedOutcome?: string;
  acceptanceCriteria: string[];
}): string => {
  const criteriaFragment = input.acceptanceCriteria
    .map((criterion) => toCanonicalFragment(criterion))
    .join("-");

  const joined = [
    input.source,
    toCanonicalFragment(input.title),
    toCanonicalFragment(input.problem),
    toCanonicalFragment(input.requestedOutcome ?? ""),
    criteriaFragment,
  ]
    .filter(Boolean)
    .join("-");

  return `fi-${joined}`.slice(0, 220);
};

const sourceToLabel = (source: "jira" | "github-issue" | "manual" | "other"): string => {
  return `source:${source}`;
};

const toUniqueCriteria = (criteria: string[]): string[] => {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const criterion of criteria) {
    const normalized = normalizeWhitespace(criterion);
    if (!normalized) {
      continue;
    }

    const lookupKey = normalized.toLowerCase();
    if (seen.has(lookupKey)) {
      continue;
    }

    seen.add(lookupKey);
    cleaned.push(normalized);
  }

  return cleaned;
};

const buildIssueBody = (input: {
  source: "jira" | "github-issue" | "manual" | "other";
  externalId: string;
  externalUrl?: string;
  requestedBy?: string;
  title: string;
  problem: string;
  requestedOutcome?: string;
  acceptanceCriteria: string[];
  canonicalKey: string;
  riskLabel: "risk:trivial" | "risk:low" | "risk:medium" | "risk:high" | "risk:critical";
}): string => {
  const criteriaChecklist = input.acceptanceCriteria
    .map((criterion) => `- [ ] ${criterion}`)
    .join("\n");

  const outcome = input.requestedOutcome
    ? normalizeWhitespace(input.requestedOutcome)
    : "Define desired user/business outcome during triage.";

  const sourceUrlLine = input.externalUrl ? `- Source URL: ${input.externalUrl}` : "";
  const requesterLine = input.requestedBy ? `- Requested by: ${normalizeWhitespace(input.requestedBy)}` : "";

  return [
    "## Summary",
    normalizeWhitespace(input.title),
    "",
    "## Problem",
    normalizeWhitespace(input.problem),
    "",
    "## Requested Outcome",
    outcome,
    "",
    "## Acceptance Criteria",
    criteriaChecklist,
    "",
    "## Source Metadata",
    `- Source: ${sourceToLabel(input.source)}`,
    `- External ID: ${normalizeWhitespace(input.externalId)}`,
    sourceUrlLine,
    requesterLine,
    `- Risk Class: ${input.riskLabel}`,
    "",
    "## Agent Metadata",
    "- Lifecycle: agent:fixable",
    `- Idempotency key: ${input.canonicalKey}`,
    "",
    `<!-- buddy:feature-intake-key:${input.canonicalKey} -->`,
  ]
    .filter((line) => line !== "")
    .join("\n");
};

const buildIssueTitle = (title: string): string => {
  const normalized = normalizeWhitespace(title);
  return normalized.startsWith("[feature-intake]")
    ? normalized
    : `[feature-intake] ${normalized}`;
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("featureIntakes")
      .withIndex("by_created")
      .order("desc")
      .collect();
  },
});

export const listByStatus = query({
  args: {
    status: intakeStatusValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("featureIntakes")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: {
    id: v.id("featureIntakes"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBySourceExternal = query({
  args: {
    source: intakeSourceValidator,
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("featureIntakes")
      .withIndex("by_source_external", (q) =>
        q.eq("source", args.source).eq("externalId", args.externalId)
      )
      .first();
  },
});

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
    const externalId = normalizeWhitespace(args.externalId);
    const title = normalizeWhitespace(args.title);
    const problem = normalizeWhitespace(args.problem);

    if (!externalId) {
      throw new Error("externalId is required");
    }

    if (!title) {
      throw new Error("title is required");
    }

    if (!problem) {
      throw new Error("problem is required");
    }

    const existingByExternal = await ctx.db
      .query("featureIntakes")
      .withIndex("by_source_external", (q) =>
        q.eq("source", args.source).eq("externalId", externalId)
      )
      .first();

    if (existingByExternal) {
      return {
        intakeId: existingByExternal._id,
        status: "existing-external" as const,
        canonicalKey: existingByExternal.canonicalKey,
        canonicalIssueTitle: existingByExternal.canonicalIssueTitle,
        canonicalIssueBody: existingByExternal.canonicalIssueBody,
        canonicalIssueLabels: existingByExternal.canonicalIssueLabels,
      };
    }

    const acceptanceCriteria = toUniqueCriteria(args.acceptanceCriteria ?? []);
    if (acceptanceCriteria.length === 0) {
      acceptanceCriteria.push("Acceptance criteria to be refined during triage.");
    }

    const requestedOutcome = args.requestedOutcome
      ? normalizeWhitespace(args.requestedOutcome)
      : undefined;

    const canonicalKey = toCanonicalKey({
      source: args.source,
      title,
      problem,
      requestedOutcome,
      acceptanceCriteria,
    });

    const existingByCanonical = await ctx.db
      .query("featureIntakes")
      .withIndex("by_canonical_key", (q) => q.eq("canonicalKey", canonicalKey))
      .first();

    const riskLabel = args.riskLabel ?? "risk:low";
    const canonicalIssueTitle = buildIssueTitle(title);
    const canonicalIssueLabels = [
      "agent:fixable",
      sourceToLabel(args.source),
      riskLabel,
    ];

    const canonicalIssueBody = buildIssueBody({
      source: args.source,
      externalId,
      externalUrl: args.externalUrl,
      requestedBy: args.requestedBy,
      title,
      problem,
      requestedOutcome,
      acceptanceCriteria,
      canonicalKey,
      riskLabel,
    });

    const now = Date.now();
    const status = existingByCanonical ? "duplicate" : "draft";

    const intakeId = await ctx.db.insert("featureIntakes", {
      source: args.source,
      externalId,
      externalUrl: args.externalUrl,
      requestedBy: args.requestedBy,
      title,
      problem,
      requestedOutcome,
      acceptanceCriteria,
      riskLabel,
      canonicalKey,
      canonicalIssueTitle,
      canonicalIssueBody,
      canonicalIssueLabels,
      status,
      duplicateOfId: existingByCanonical?._id,
      canonicalIssueNumber: existingByCanonical?.canonicalIssueNumber,
      canonicalIssueUrl: existingByCanonical?.canonicalIssueUrl,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    return {
      intakeId,
      status: existingByCanonical ? ("deduped" as const) : ("created" as const),
      canonicalKey,
      canonicalIssueTitle,
      canonicalIssueBody,
      canonicalIssueLabels,
      duplicateOfId: existingByCanonical?._id,
    };
  },
});

export const linkCanonicalIssue = mutation({
  args: {
    id: v.id("featureIntakes"),
    issueNumber: v.number(),
    issueUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error(`Feature intake ${args.id} not found`);
    }

    const now = Date.now();

    await ctx.db.patch(args.id, {
      status: "linked",
      canonicalIssueNumber: args.issueNumber,
      canonicalIssueUrl: args.issueUrl,
      updatedAt: now,
    });

    return args.id;
  },
});
