// Barrel re-export — all consumers import unchanged from '@/api/github' or '../api/github'

// ── Shared infrastructure ───────────────────────────────────────────────────
export {
  clearOrgAvatarCache,
  clearAllCaches,
  getOrgAvatarCacheEntry,
  type ProgressCallback,
  type DiffFile,
  type PRCommentReactionContent,
  type PRReviewComment,
} from './shared'

// ── PR search/list ──────────────────────────────────────────────────────────
export { type RepoPullRequest, type PRFilesChangedSummary, type PRSearchMode } from './prs'

// ── PR detail/threads/checks ────────────────────────────────────────────────
export {
  type PRLinkedIssue,
  type PRHistorySummary,
  type PRReviewThread,
  type PRReviewSummary,
  type PRThreadsResult,
  type PRChecksSummary,
} from './pr-detail'

// ── Repository ──────────────────────────────────────────────────────────────
export {
  type RepoDetail,
  type RepoCommit,
  type RepoCommitDetail,
  type RepoIssue,
  type RepoIssueDetail,
  type RepoCounts,
} from './repos'

// ── Organizations ───────────────────────────────────────────────────────────
export {
  type OrgRepo,
  type OrgRepoResult,
  type OrgMember,
  type OrgMemberResult,
  type OrgTeam,
  type OrgTeamResult,
  type TeamMember,
  type TeamMembersResult,
  type OrgOverviewResult,
} from './orgs'

// ── Users ───────────────────────────────────────────────────────────────────
export {
  type UserActivitySummary,
  type UserPRSummary,
  type UserEvent,
  type ContributionWeek,
  EVENT_LABELS,
  eventSummary,
  assignContributionColor,
  computeQuartiles,
  buildContributionCalendar,
} from './users'

// ── Client ──────────────────────────────────────────────────────────────────
export { GitHubClient } from './client'
