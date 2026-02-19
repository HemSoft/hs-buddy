/**
 * Set it Free Governance — TypeScript constants and types
 *
 * Single source of truth for labels, risk classes, retry limits, fan-out
 * ceilings, and merge authority rules used throughout the app.
 *
 * Policy reference: docs/SET_IT_FREE_GOVERNANCE.md
 */

// ─── Label taxonomy ───────────────────────────────────────────────────────────

/** Agent lifecycle labels applied to issues and PRs. */
export const AgentLabel = {
  FIXABLE:           "agent:fixable",
  IN_PROGRESS:       "agent:in-progress",
  REVIEW_REQUESTED:  "agent:review-requested",
  PAUSE:             "agent:pause",
  HUMAN_REQUIRED:    "agent:human-required",
  ESCALATED:         "agent:escalated",
} as const;

export type AgentLabel = (typeof AgentLabel)[keyof typeof AgentLabel];

/** Risk-class labels — co-applied with lifecycle labels. */
export const RiskLabel = {
  TRIVIAL:  "risk:trivial",
  LOW:      "risk:low",
  MEDIUM:   "risk:medium",
  HIGH:     "risk:high",
  CRITICAL: "risk:critical",
} as const;

export type RiskLabel = (typeof RiskLabel)[keyof typeof RiskLabel];

/** Intake-source labels — identify how an issue entered the queue. */
export const SourceLabel = {
  REPO_AUDIT:    "source:repo-audit",
  JIRA:          "source:jira",
  GITHUB_ISSUE:  "source:github-issue",
  MANUAL:        "source:manual",
} as const;

export type SourceLabel = (typeof SourceLabel)[keyof typeof SourceLabel];

/** Issue-type labels — distinguish informational reports from actionable items. */
export const TypeLabel = {
  /** Informational output only — automation must not act on this issue. */
  REPORT:      "type:report",
  /** Actionable item — automation will process and generate a PR. */
  ACTION_ITEM: "type:action-item",
} as const;

export type TypeLabel = (typeof TypeLabel)[keyof typeof TypeLabel];

/** Opt-out label — disables automation on a specific issue. */
export const NO_AGENT_LABEL = "no-agent";

// ─── Risk classes ─────────────────────────────────────────────────────────────

export type RiskClass = "trivial" | "low" | "medium" | "high" | "critical";

// ─── Retry policy ─────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Maximum number of automated fix attempts (0 = never retry). */
  maxRetries: number;
  /** Backoff strategy between retries. */
  backoff: "none" | "fixed" | "exponential";
  /** Base delay in milliseconds for fixed/exponential backoff. */
  baseDelayMs: number;
  /** Action taken when all retries are exhausted. */
  onExhausted: "close-reopen" | "agent:pause" | "agent:human-required";
}

/** Retry limits per risk class (see governance policy §2). */
export const RETRY_POLICY: Record<RiskClass, RetryPolicy> = {
  trivial: {
    maxRetries:  3,
    backoff:     "fixed",
    baseDelayMs: 5 * 60_000, // 5 min
    onExhausted: "close-reopen",
  },
  low: {
    maxRetries:  3,
    backoff:     "exponential",
    baseDelayMs: 5 * 60_000, // 5, 15, 45 min
    onExhausted: "agent:pause",
  },
  medium: {
    maxRetries:  2,
    backoff:     "exponential",
    baseDelayMs: 15 * 60_000, // 15, 60 min
    onExhausted: "agent:human-required",
  },
  high: {
    maxRetries:  1,
    backoff:     "none",
    baseDelayMs: 0,
    onExhausted: "agent:human-required",
  },
  critical: {
    maxRetries:  0,
    backoff:     "none",
    baseDelayMs: 0,
    onExhausted: "agent:human-required",
  },
};

// ─── Fan-out limits ───────────────────────────────────────────────────────────

/** Maximum number of concurrently open agent-created issues. */
export const FAN_OUT_LIMITS = {
  /** Per single repository. */
  perRepo:          10,
  /** Per risk class at medium or higher, per repository. */
  perMediumPlusRisk: 3,
  /** Per workflow type (e.g., repo-audit, feature-intake). */
  perWorkflowType:   5,
  /** Across the entire portfolio. */
  portfolioWide:    25,
} as const;

// ─── Merge authority ──────────────────────────────────────────────────────────

export type MergeAuthority = "auto" | "copilot-review" | "human" | "human-senior";

export interface MergePolicy {
  authority: MergeAuthority;
  /** Minimum number of approving reviews required. */
  requiredReviews: number;
  /** Whether CI must be green before merge. */
  requiresGreenCI: boolean;
  /** Whether the PR quality gate must pass. */
  requiresQualityGate: boolean;
  /** Maximum allowed diff size in lines (undefined = no limit). */
  maxDiffLines?: number;
}

/** Merge authority matrix per risk class (see governance policy §3). */
export const MERGE_POLICY: Record<RiskClass, MergePolicy> = {
  trivial: {
    authority:           "auto",
    requiredReviews:     0,
    requiresGreenCI:     true,
    requiresQualityGate: false,
  },
  low: {
    authority:           "auto",
    requiredReviews:     0,
    requiresGreenCI:     true,
    requiresQualityGate: true,
    maxDiffLines:        300,
  },
  medium: {
    authority:           "copilot-review",
    requiredReviews:     1,
    requiresGreenCI:     true,
    requiresQualityGate: true,
    maxDiffLines:        150,
  },
  high: {
    authority:           "human",
    requiredReviews:     1,
    requiresGreenCI:     true,
    requiresQualityGate: true,
    maxDiffLines:        150,
  },
  critical: {
    authority:           "human-senior",
    requiredReviews:     2,
    requiresGreenCI:     true,
    requiresQualityGate: true,
  },
};

// ─── Safe write boundaries ────────────────────────────────────────────────────

/**
 * Glob patterns for paths the agent must NEVER touch without explicit human
 * approval. If any changed path matches a pattern here, apply agent:human-required.
 */
export const PROHIBITED_PATH_PATTERNS: readonly string[] = [
  "**/auth/**",
  "**/oauth/**",
  "**/.env*",
  "**/secrets/**",
  "**/payment/**",
  "**/billing/**",
  "**/checkout/**",
  "**/migrations/**",
  "**/seeds/**",
  ".github/workflows/**",
  "Jenkinsfile",
  "*.yml",            // repo-root YAML only — workflow globs above are more specific
  "**/cors/**",
  "**/csp/**",
  "**/headers/**",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
];

// ─── Escalation thresholds ────────────────────────────────────────────────────

export const ESCALATION_THRESHOLDS = {
  /** Closed/failed PRs with the same idempotency key in the past N days. */
  repeatedFailuresLookbackDays: 30,
  repeatedFailuresLimit:         3,
  /** Maximum number of quality gate failures on the same PR before escalation. */
  qualityGateFailuresLimit:      2,
} as const;

// ─── Escalation milestone ────────────────────────────────────────────────────

/** Name of the GitHub milestone used to track escalated issues. */
export const ESCALATIONS_MILESTONE = "Escalations";

// ─── Helper utilities ─────────────────────────────────────────────────────────

/**
 * Returns the risk class inferred from a set of labels on an issue/PR.
 * Falls back to "medium" when no risk label is present.
 */
export function getRiskClass(labels: string[]): RiskClass {
  if (labels.includes(RiskLabel.CRITICAL)) return "critical";
  if (labels.includes(RiskLabel.HIGH))     return "high";
  if (labels.includes(RiskLabel.MEDIUM))   return "medium";
  if (labels.includes(RiskLabel.LOW))      return "low";
  if (labels.includes(RiskLabel.TRIVIAL))  return "trivial";
  return "medium"; // safe default
}

/**
 * Returns true when the given file path matches any prohibited path pattern.
 * Uses simple glob-style matching (prefix/suffix wildcards only).
 */
export function isProhibitedPath(filePath: string): boolean {
  return PROHIBITED_PATH_PATTERNS.some((pattern) =>
    matchGlob(pattern, filePath)
  );
}

/** Minimal glob matcher supporting `*` (segment) and `**` (multi-segment). */
function matchGlob(pattern: string, filePath: string): boolean {
  // Normalise separators
  const norm = filePath.replace(/\\/g, "/");
  // Convert glob to regex
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/\\/g, "/")
        .replace(/[.+^${}()|[\]]/g, "\\$&") // escape special regex chars
        .replace(/\*\*\//g, "(?:.+/)?")      // **/ → any path prefix
        .replace(/\*\*/g,   ".*")            // ** → anything
        .replace(/\*/g,     "[^/]*")         // * → any single segment
      + "$"
  );
  return regex.test(norm);
}
