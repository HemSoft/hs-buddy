import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { GitHubClient } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { useCopilotReviewMonitor, clearPendingReview } from '../hooks/useCopilotReviewMonitor'
import type { PRDetailInfo } from '../utils/prDetailView'
import type { PRDetailSection } from '../utils/prDetailView'
import type { PRHistorySummary, PRLinkedIssue } from '../api/github'
import { formatDistanceToNow, formatDateFull } from '../utils/dateUtils'
import { parseOwnerRepoFromUrl } from '../utils/githubUrl'
import { throwIfAborted } from '../utils/errorUtils'
import { PullRequestHistoryPanel } from './PullRequestHistoryPanel'
import { PRChecksPanel } from './PRChecksPanel'
import { PRFilesChangedPanel } from './PRFilesChangedPanel'
import { PRThreadsPanel } from './PRThreadsPanel'
import { PRReviewsPanel } from './PRReviewsPanel'
import './PullRequestDetailPanel.css'

interface PullRequestDetailPanelProps {
  pr: PRDetailInfo
  section?: PRDetailSection | null
}

const SECTION_LABELS: Record<PRDetailSection, string> = {
  conversation: 'Conversation',
  commits: 'Commits',
  checks: 'Checks',
  'files-changed': 'Files changed',
  'ai-reviews': 'AI Reviews',
}

function formatRelative(date: string | null): string {
  if (!date) return ''
  return formatDistanceToNow(date)
}

// --- Sub-components extracted for react-doctor component-size ---

interface PRDetailHeaderProps {
  pr: PRDetailInfo
  stateLabel: string
  branches: { headBranch: string; baseBranch: string } | null
  copilotReviewState: string
  handleRequestCopilotReview: () => void
  onRefresh: () => void
}

function PRDetailHeader({
  pr,
  stateLabel,
  branches,
  copilotReviewState,
  handleRequestCopilotReview,
  onRefresh,
}: PRDetailHeaderProps) {
  return (
    <div className="pr-detail-header">
      <div className="pr-detail-title-wrap">
        <div className="pr-detail-title-row">
          <h2 className="pr-detail-title">
            <GitPullRequest size={18} />
            <span className="pr-detail-title-text">{pr.title}</span>
            <span className="pr-detail-pr-number">#{pr.id}</span>
          </h2>
          <span className={`pr-detail-state-badge pr-detail-state-${stateLabel.toLowerCase()}`}>
            {stateLabel}
          </span>
        </div>
        <div className="pr-detail-subtitle">
          <span className="pr-detail-author">{pr.author}</span>
          <span className="pr-detail-dot">·</span>
          <span>{pr.org || pr.source}</span>
          <span className="pr-detail-dot">·</span>
          <span>{pr.repository}</span>
          {branches?.baseBranch && branches?.headBranch && (
            <>
              <span className="pr-detail-dot">·</span>
              <span className="pr-detail-branch-flow">
                <GitBranch size={12} />
                into <strong>{branches.baseBranch}</strong> from{' '}
                <strong>{branches.headBranch}</strong>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="pr-detail-header-actions">
        <button
          className={`pr-detail-refresh-btn${
            copilotReviewState === 'monitoring' ? ' pr-detail-copilot-monitoring' : ''
          }${copilotReviewState === 'done' ? ' pr-detail-copilot-done' : ''}`}
          onClick={handleRequestCopilotReview}
          title={
            copilotReviewState === 'requesting'
              ? 'Requesting Copilot review…'
              : copilotReviewState === 'monitoring'
                ? 'Waiting for Copilot review…'
                : copilotReviewState === 'done'
                  ? 'Copilot review complete!'
                  : 'Request Copilot Review'
          }
          disabled={copilotReviewState !== 'idle'}
        >
          {copilotReviewState === 'requesting' ? (
            <Loader2 size={14} className="pr-detail-spin" />
          ) : copilotReviewState === 'done' ? (
            <CheckCircle2 size={14} />
          ) : (
            <Sparkles size={14} className={copilotReviewState === 'monitoring' ? 'pulse' : ''} />
          )}
        </button>
        <button className="pr-detail-refresh-btn" onClick={onRefresh} title="Refresh PR data">
          <RefreshCw size={14} />
        </button>
        <button className="pr-detail-open-btn" onClick={() => window.shell.openExternal(pr.url)}>
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>
    </div>
  )
}

interface CopilotReviewBannerProps {
  completedAt: number
  onDismiss: () => void
}

function CopilotReviewBanner({ completedAt, onDismiss }: CopilotReviewBannerProps) {
  return (
    <div className="pr-detail-review-banner">
      <div className="pr-detail-review-banner-content">
        <CheckCircle2 size={16} />
        <div className="pr-detail-review-banner-text">
          <strong>Copilot review complete</strong>
          <span>Finished {formatDistanceToNow(completedAt)} — page refreshed with latest data</span>
        </div>
      </div>
      <button className="pr-detail-review-banner-dismiss" onClick={onDismiss} title="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}

interface PROverviewSectionProps {
  pr: PRDetailInfo
  youApproved: boolean
  effectiveIssue: { number: number; url: string } | null
  createdRelative: string
  activityRelative: string
  activityAt: string | null
}

function PROverviewSection({
  pr,
  youApproved,
  effectiveIssue,
  createdRelative,
  activityRelative,
  activityAt,
}: PROverviewSectionProps) {
  return (
    <>
      <div className="pr-detail-grid">
        <div className="pr-detail-card">
          <div className="pr-detail-card-title">Status</div>
          <div className="pr-detail-card-value pr-detail-state">{pr.state}</div>
        </div>
        <div className="pr-detail-card">
          <div className="pr-detail-card-title">Approvals</div>
          <div className="pr-detail-card-value">
            {pr.approvalCount}/{pr.assigneeCount > 0 ? pr.assigneeCount : '?'}
          </div>
        </div>
        <div className="pr-detail-card">
          <div className="pr-detail-card-title">You Approved</div>
          <div className="pr-detail-card-value">{youApproved ? 'Yes' : 'No'}</div>
        </div>
        {effectiveIssue ? (
          <button
            type="button"
            className="pr-detail-card pr-detail-card-interactive"
            onClick={() => window.shell.openExternal(effectiveIssue.url)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                window.shell.openExternal(effectiveIssue.url)
              }
            }}
            title={`Open Issue #${effectiveIssue.number} on GitHub`}
          >
            <div className="pr-detail-card-title">
              <CircleDot size={12} />
              Linked Issue
            </div>
            <div className="pr-detail-card-value">
              <span className="pr-detail-linked-issue">#{effectiveIssue.number}</span>
            </div>
          </button>
        ) : (
          <div className="pr-detail-card" title="No linked issue">
            <div className="pr-detail-card-title">
              <CircleDot size={12} />
              Linked Issue
            </div>
            <div className="pr-detail-card-value">
              <span className="pr-detail-card-secondary">None</span>
            </div>
          </div>
        )}
      </div>

      <div className="pr-detail-meta-list">
        <div className="pr-detail-meta-item pr-detail-meta-item-author">
          <div className="pr-detail-meta-label">
            <User size={14} />
            Author
          </div>
          <div className="pr-detail-meta-value">
            {pr.authorAvatarUrl && (
              <img src={pr.authorAvatarUrl} alt={pr.author} className="pr-detail-avatar" />
            )}
            <span className="pr-detail-author-text">{pr.author}</span>
          </div>
        </div>
        <div className="pr-detail-meta-item">
          <div className="pr-detail-meta-label">
            <Clock size={14} />
            Created
            {createdRelative && (
              <span className="pr-detail-meta-relative">({createdRelative})</span>
            )}
          </div>
          <div className="pr-detail-meta-value">{formatDateFull(pr.created)}</div>
        </div>
        <div className="pr-detail-meta-item">
          <div className="pr-detail-meta-label">
            <Check size={14} />
            Last Activity
            {activityRelative && (
              <span className="pr-detail-meta-relative">({activityRelative})</span>
            )}
          </div>
          <div className="pr-detail-meta-value">{formatDateFull(activityAt)}</div>
        </div>
      </div>
    </>
  )
}

export function PullRequestDetailPanel({ pr, section = null }: PullRequestDetailPanelProps) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url) ?? null, [pr.url])

  const {
    copilotReviewState,
    copilotReviewBanner,
    setCopilotReviewBanner,
    refreshKey,
    setRefreshKey,
    handleRequestCopilotReview,
  } = useCopilotReviewMonitor({ prId: pr.id, prUrl: pr.url, ownerRepo })

  const [branches, setBranches] = useState<{ headBranch: string; baseBranch: string } | null>(
    pr.headBranch && pr.baseBranch ? { headBranch: pr.headBranch, baseBranch: pr.baseBranch } : null
  )
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState<string | null>(null)
  const [youApproved, setYouApproved] = useState(pr.iApproved)
  const [linkedIssues, setLinkedIssues] = useState<PRLinkedIssue[]>([])

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    setYouApproved(pr.iApproved)
  }, [pr.id, pr.url, pr.iApproved])

  useEffect(() => {
    setHistoryUpdatedAt(null)
    setLinkedIssues([])
  }, [pr.id, pr.repository, pr.url])

  const fetchBranches = useCallback(async () => {
    if (pr.headBranch && pr.baseBranch) {
      setBranches({ headBranch: pr.headBranch, baseBranch: pr.baseBranch })
      return
    }

    const ownerRepo = parseOwnerRepoFromUrl(pr.url)
    if (!ownerRepo) {
      setBranches(null)
      return
    }

    try {
      const result = await enqueueRef.current(
        /* v8 ignore start */
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRBranches(ownerRepo.owner, ownerRepo.repo, pr.id)
          /* v8 ignore stop */
        },
        { name: `pr-branches-${pr.repository}-${pr.id}` }
      )
      /* v8 ignore start */
      setBranches(result)
      /* v8 ignore stop */
    } catch {
      setBranches(null)
    }
  }, [accounts, pr.id, pr.repository, pr.url, pr.headBranch, pr.baseBranch])

  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  const activityAt = historyUpdatedAt || pr.updatedAt || pr.date || pr.created
  const activityRelative = formatRelative(activityAt)
  const createdRelative = formatRelative(pr.created)
  const stateLabel = pr.state?.trim() || 'open'
  const sectionLabel = section ? (SECTION_LABELS[section] ?? null) : null
  const checksUrl = `${pr.url}/checks`
  const filesChangedUrl = `${pr.url}/files`
  const isFocusedSection = section !== null
  const showOverview = !isFocusedSection

  // Derive effective linked issue: prefer API data, fall back to branch name parsing
  const branchIssue = (() => {
    if (linkedIssues.length > 0) return null
    const branch = branches?.headBranch || pr.headBranch
    if (!branch) return null
    const match = branch.match(/issue-(\d+)/)
    if (!match) return null
    const num = Number(match[1])
    const ownerRepo = parseOwnerRepoFromUrl(pr.url)
    if (!ownerRepo) return null
    return {
      number: num,
      title: '',
      url: `https://github.com/${ownerRepo.owner}/${ownerRepo.repo}/issues/${num}`,
    }
  })()
  const effectiveIssue = linkedIssues[0] ?? branchIssue

  const handleHistoryLoaded = useCallback(
    (history: PRHistorySummary) => {
      setHistoryUpdatedAt(history.updatedAt || null)
      setLinkedIssues(history.linkedIssues)

      const ownerRepo = parseOwnerRepoFromUrl(pr.url)
      const namespace = pr.org || ownerRepo?.owner || ''

      const scopedAccounts = namespace
        ? accounts.filter(account => account.org.toLowerCase() === namespace.toLowerCase())
        : []

      const candidateLogins = new Set(
        (scopedAccounts.length > 0 ? scopedAccounts : accounts).map(account =>
          account.username.toLowerCase()
        )
      )

      if (candidateLogins.size === 0) {
        return
      }

      const approvedByYou = history.reviewers.some(
        reviewer =>
          reviewer.status === 'approved' && candidateLogins.has(reviewer.login.toLowerCase())
      )

      setYouApproved(approvedByYou)
    },
    [accounts, pr.org, pr.url]
  )

  return (
    <div className="pr-detail-container">
      <PRDetailHeader
        pr={pr}
        stateLabel={stateLabel}
        branches={branches}
        copilotReviewState={copilotReviewState}
        handleRequestCopilotReview={handleRequestCopilotReview}
        onRefresh={() => setRefreshKey(k => k + 1)}
      />

      {copilotReviewBanner && (
        <CopilotReviewBanner
          completedAt={copilotReviewBanner.completedAt}
          onDismiss={() => {
            setCopilotReviewBanner(null)
            clearPendingReview(pr.url)
          }}
        />
      )}

      {sectionLabel && (
        <div className="pr-detail-section-note">
          <span>Tree section: {sectionLabel}</span>
          {section === 'checks' && (
            <button
              className="pr-detail-open-btn"
              onClick={() => window.shell.openExternal(checksUrl)}
            >
              <ExternalLink size={14} />
              Open Checks
            </button>
          )}
          {section === 'files-changed' && (
            <button
              className="pr-detail-open-btn"
              onClick={() => window.shell.openExternal(filesChangedUrl)}
            >
              <ExternalLink size={14} />
              Open Files Changed
            </button>
          )}
        </div>
      )}

      {showOverview && (
        <PROverviewSection
          pr={pr}
          youApproved={youApproved}
          effectiveIssue={effectiveIssue}
          createdRelative={createdRelative}
          activityRelative={activityRelative}
          activityAt={activityAt}
        />
      )}

      {section === 'conversation' && <PRThreadsPanel key={refreshKey} pr={pr} />}
      {section === 'commits' && (
        <PullRequestHistoryPanel
          key={refreshKey}
          pr={pr}
          embedded
          focus="commits"
          onLoaded={handleHistoryLoaded}
        />
      )}
      {section === 'checks' && <PRChecksPanel key={refreshKey} pr={pr} />}
      {section === 'files-changed' && <PRFilesChangedPanel key={refreshKey} pr={pr} />}
      {section === 'ai-reviews' && <PRReviewsPanel key={refreshKey} pr={pr} />}

      {!isFocusedSection && (
        <>
          <PullRequestHistoryPanel
            key={refreshKey}
            pr={pr}
            embedded
            onLoaded={handleHistoryLoaded}
          />
          <PRThreadsPanel key={`threads-${refreshKey}`} pr={pr} />
        </>
      )}
    </div>
  )
}
