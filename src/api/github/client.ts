import type { PullRequest, PRConfig } from '../../types/pullRequest'
import type { SFLRepoStatus } from '../../types/sflStatus'
import { DEFAULT_RECENTLY_MERGED_DAYS } from '../../constants'
import type { ProgressCallback, PRCommentReactionContent, PRReviewComment } from './shared'
import { getActiveCliAccount, getRateLimit } from './shared'

import type { RepoPullRequest, PRFilesChangedSummary } from './prs'
import {
  fetchMyPRs as _fetchMyPRs,
  fetchNeedsReview as _fetchNeedsReview,
  fetchRecentlyMerged as _fetchRecentlyMerged,
  fetchNeedANudge as _fetchNeedANudge,
  fetchRepoPRs as _fetchRepoPRs,
} from './prs'

import type { PRHistorySummary, PRChecksSummary, PRThreadsResult } from './pr-detail'
import {
  fetchPRBranches as _fetchPRBranches,
  fetchPRFilesChanged as _fetchPRFilesChanged,
  fetchPRHistory as _fetchPRHistory,
  fetchPRBody as _fetchPRBody,
  fetchPRChecks as _fetchPRChecks,
  fetchPRThreads as _fetchPRThreads,
  replyToReviewThread as _replyToReviewThread,
  resolveReviewThread as _resolveReviewThread,
  unresolveReviewThread as _unresolveReviewThread,
} from './pr-detail'
import {
  addPRComment as _addPRComment,
  addCommentReaction as _addCommentReaction,
  approvePullRequest as _approvePullRequest,
  requestCopilotReview as _requestCopilotReview,
  listPRReviews as _listPRReviews,
} from './pr-mutations'

import type {
  RepoDetail,
  RepoCommit,
  RepoCommitDetail,
  RepoIssue,
  RepoIssueDetail,
  RepoCounts,
} from './repos'
import {
  fetchRepoDetail as _fetchRepoDetail,
  fetchRepoCommits as _fetchRepoCommits,
  fetchRepoCommitDetail as _fetchRepoCommitDetail,
  fetchRepoCounts as _fetchRepoCounts,
  fetchRepoIssues as _fetchRepoIssues,
  fetchRepoIssueDetail as _fetchRepoIssueDetail,
} from './repos'

import type {
  OrgRepoResult,
  OrgMemberResult,
  OrgTeamResult,
  TeamMembersResult,
  OrgOverviewResult,
} from './orgs'
import {
  fetchOrgRepos as _fetchOrgRepos,
  fetchOrgMembers as _fetchOrgMembers,
  fetchOrgTeams as _fetchOrgTeams,
  fetchTeamMembers as _fetchTeamMembers,
  fetchOrgOverview as _fetchOrgOverview,
} from './orgs'

import type { UserActivitySummary } from './users'
import { fetchUserActivity as _fetchUserActivity } from './users'

import { fetchSFLStatus as _fetchSFLStatus } from './sfl'

export class GitHubClient {
  private config: PRConfig['github']
  private recentlyMergedDays: number = DEFAULT_RECENTLY_MERGED_DAYS

  constructor(
    config: PRConfig['github'],
    recentlyMergedDays: number = DEFAULT_RECENTLY_MERGED_DAYS
  ) {
    this.config = config
    this.recentlyMergedDays = recentlyMergedDays
  }

  static async getActiveCliAccount(): Promise<string | null> {
    return getActiveCliAccount()
  }

  // ── PR search/list ────────────────────────────────────────────────────

  async fetchMyPRs(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return _fetchMyPRs(this.config, this.recentlyMergedDays, onProgress)
  }

  async fetchNeedsReview(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return _fetchNeedsReview(this.config, this.recentlyMergedDays, onProgress)
  }

  async fetchRecentlyMerged(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return _fetchRecentlyMerged(this.config, this.recentlyMergedDays, onProgress)
  }

  async fetchNeedANudge(onProgress?: ProgressCallback): Promise<PullRequest[]> {
    return _fetchNeedANudge(this.config, this.recentlyMergedDays, onProgress)
  }

  async fetchRepoPRs(
    owner: string,
    repo: string,
    state: 'open' | 'closed' = 'open'
  ): Promise<RepoPullRequest[]> {
    return _fetchRepoPRs(this.config, owner, repo, state)
  }

  // ── PR detail/threads/checks/mutations ────────────────────────────────

  async fetchPRBranches(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{ headBranch: string; baseBranch: string; headSha: string }> {
    return _fetchPRBranches(this.config, owner, repo, pullNumber)
  }

  async fetchPRFilesChanged(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PRFilesChangedSummary> {
    return _fetchPRFilesChanged(this.config, owner, repo, pullNumber)
  }

  async fetchPRHistory(owner: string, repo: string, pullNumber: number): Promise<PRHistorySummary> {
    return _fetchPRHistory(this.config, owner, repo, pullNumber)
  }

  /* v8 ignore next -- delegate; real API call tested via integration */
  async fetchPRBody(owner: string, repo: string, pullNumber: number): Promise<string> {
    return _fetchPRBody(this.config, owner, repo, pullNumber)
  }

  async fetchPRChecks(owner: string, repo: string, pullNumber: number): Promise<PRChecksSummary> {
    return _fetchPRChecks(this.config, owner, repo, pullNumber)
  }

  async fetchPRThreads(owner: string, repo: string, pullNumber: number): Promise<PRThreadsResult> {
    return _fetchPRThreads(this.config, owner, repo, pullNumber)
  }

  async replyToReviewThread(
    owner: string,
    pullNumber: number,
    threadId: string,
    body: string
  ): Promise<PRReviewComment> {
    return _replyToReviewThread(this.config, owner, pullNumber, threadId, body)
  }

  async resolveReviewThread(owner: string, threadId: string): Promise<void> {
    return _resolveReviewThread(this.config, owner, threadId)
  }

  async unresolveReviewThread(owner: string, threadId: string): Promise<void> {
    return _unresolveReviewThread(this.config, owner, threadId)
  }

  async addPRComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string
  ): Promise<PRReviewComment> {
    return _addPRComment(this.config, owner, repo, pullNumber, body)
  }

  async addCommentReaction(
    owner: string,
    subjectId: string,
    content: PRCommentReactionContent
  ): Promise<void> {
    return _addCommentReaction(this.config, owner, subjectId, content)
  }

  async approvePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    body = 'Approved'
  ): Promise<void> {
    return _approvePullRequest(this.config, owner, repo, pullNumber, body)
  }

  async requestCopilotReview(owner: string, repo: string, pullNumber: number): Promise<void> {
    return _requestCopilotReview(this.config, owner, repo, pullNumber)
  }

  async listPRReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<
    { id: number; user: { login: string } | null; state: string; submitted_at: string | null }[]
  > {
    return _listPRReviews(this.config, owner, repo, pullNumber)
  }

  // ── Repository ────────────────────────────────────────────────────────

  async fetchRepoDetail(owner: string, repo: string): Promise<RepoDetail> {
    return _fetchRepoDetail(this.config, owner, repo)
  }

  async fetchRepoCommits(owner: string, repo: string, perPage = 25): Promise<RepoCommit[]> {
    return _fetchRepoCommits(this.config, owner, repo, perPage)
  }

  async fetchRepoCommitDetail(owner: string, repo: string, ref: string): Promise<RepoCommitDetail> {
    return _fetchRepoCommitDetail(this.config, owner, repo, ref)
  }

  async fetchRepoCounts(owner: string, repo: string): Promise<RepoCounts> {
    return _fetchRepoCounts(this.config, owner, repo)
  }

  async fetchRepoIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' = 'open'
  ): Promise<RepoIssue[]> {
    return _fetchRepoIssues(this.config, owner, repo, state)
  }

  async fetchRepoIssueDetail(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<RepoIssueDetail> {
    return _fetchRepoIssueDetail(this.config, owner, repo, issueNumber)
  }

  // ── Organizations ─────────────────────────────────────────────────────

  async fetchOrgRepos(org: string): Promise<OrgRepoResult> {
    return _fetchOrgRepos(this.config, org)
  }

  async fetchOrgMembers(org: string): Promise<OrgMemberResult> {
    return _fetchOrgMembers(this.config, org)
  }

  async fetchOrgTeams(org: string): Promise<OrgTeamResult> {
    return _fetchOrgTeams(this.config, org)
  }

  async fetchTeamMembers(org: string, teamSlug: string): Promise<TeamMembersResult> {
    return _fetchTeamMembers(this.config, org, teamSlug)
  }

  async fetchOrgOverview(org: string): Promise<OrgOverviewResult> {
    return _fetchOrgOverview(this.config, org)
  }

  // ── Users ─────────────────────────────────────────────────────────────

  async fetchUserActivity(org: string, username: string): Promise<UserActivitySummary> {
    return _fetchUserActivity(this.config, org, username)
  }

  // ── SFL ───────────────────────────────────────────────────────────────

  async fetchSFLStatus(owner: string, repo: string): Promise<SFLRepoStatus> {
    return _fetchSFLStatus(this.config, owner, repo)
  }

  // ── Rate limit ────────────────────────────────────────────────────────

  async getRateLimit(
    org: string
  ): Promise<{ limit: number; remaining: number; reset: number; used: number }> {
    return getRateLimit(this.config, org)
  }
}
