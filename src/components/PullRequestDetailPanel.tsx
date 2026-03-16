import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clock, ExternalLink, GitBranch, GitPullRequest, User } from 'lucide-react'
import { GitHubClient } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import type { PRDetailInfo } from '../utils/prDetailView'
import type { PRDetailSection } from '../utils/prDetailView'
import type { PRHistorySummary } from '../api/github'
import { formatDistanceToNow, formatDateFull } from '../utils/dateUtils'
import { parseOwnerRepoFromUrl } from '../utils/githubUrl'
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

const SECTION_LABELS: Record<PRDetailSection, string> = {
  conversation: 'Conversation',
  commits: 'Commits',
  checks: 'Checks',
  'files-changed': 'Files changed',
  'ai-reviews': 'AI Reviews',
}

export function PullRequestDetailPanel({ pr, section = null }: PullRequestDetailPanelProps) {
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)

  const [branches, setBranches] = useState<{ headBranch: string; baseBranch: string } | null>(
    pr.headBranch && pr.baseBranch ? { headBranch: pr.headBranch, baseBranch: pr.baseBranch } : null
  )
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState<string | null>(null)
  const [youApproved, setYouApproved] = useState(pr.iApproved)

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    setYouApproved(pr.iApproved)
  }, [pr.iApproved, pr.id, pr.repository, pr.url])

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
        async signal => {
          if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
          const client = new GitHubClient({ accounts }, 7)
          return await client.fetchPRBranches(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `pr-branches-${pr.repository}-${pr.id}` }
      )
      setBranches(result)
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
  const sectionLabel = section ? SECTION_LABELS[section] ?? null : null
  const checksUrl = `${pr.url}/checks`
  const filesChangedUrl = `${pr.url}/files`
  const isFocusedSection = section !== null
  const showOverview = !isFocusedSection

  const handleHistoryLoaded = useCallback(
    (history: PRHistorySummary) => {
      setHistoryUpdatedAt(history.updatedAt || null)

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
        <button className="pr-detail-open-btn" onClick={() => window.shell.openExternal(pr.url)}>
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>

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
      )}

      {section === 'conversation' && <PRThreadsPanel pr={pr} />}
      {section === 'commits' && (
        <PullRequestHistoryPanel pr={pr} embedded focus="commits" onLoaded={handleHistoryLoaded} />
      )}
      {section === 'checks' && <PRChecksPanel pr={pr} />}
      {section === 'files-changed' && <PRFilesChangedPanel pr={pr} />}
      {section === 'ai-reviews' && <PRReviewsPanel pr={pr} />}

      {!isFocusedSection && (
        <>
          <PullRequestHistoryPanel pr={pr} embedded onLoaded={handleHistoryLoaded} />
          <PRThreadsPanel pr={pr} />
        </>
      )}
    </div>
  )
}
