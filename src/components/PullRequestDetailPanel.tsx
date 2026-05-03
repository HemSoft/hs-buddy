import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  ExternalLink,
  FileText,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageSquare,
  MoreVertical,
  RefreshCw,
  Sparkles,
  ThumbsUp,
  User,
  X,
} from 'lucide-react'
import { GitHubClient, type PRHistorySummary, type PRLinkedIssue } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { usePRPanelData } from '../hooks/usePRPanelData'
import { useCopilotReviewMonitor, clearPendingReview } from '../hooks/useCopilotReviewMonitor'
import type { PRDetailInfo, PRDetailSection } from '../utils/prDetailView'
import { resolveHeadBranch, parseIssueFromBranch } from '../utils/prDetailView'
import { formatDistanceToNow, formatDateFull } from '../utils/dateUtils'
import { parseOwnerRepoFromUrl } from '../utils/githubUrl'
import { throwIfAborted } from '../utils/errorUtils'
import { onKeyboardActivate } from '../utils/keyboard'
import { MarkdownContent } from './shared/MarkdownContent'
import { PullRequestHistoryPanel } from './PullRequestHistoryPanel'
import { PRChecksPanel } from './PRChecksPanel'
import { PRFilesChangedPanel } from './PRFilesChangedPanel'
import { PRThreadsPanel } from './PRThreadsPanel'
import { PRReviewsPanel } from './PRReviewsPanel'
import { PRDetailContextMenu } from './PRDetailContextMenu'
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

interface CopilotStateConfig {
  Icon: typeof Sparkles
  iconClass: string
  buttonClass: string
  title: string
}

const COPILOT_STATE_DEFAULT: CopilotStateConfig = {
  Icon: Sparkles,
  iconClass: '',
  buttonClass: '',
  title: 'Request Copilot Review',
}

const COPILOT_STATE_MAP: Record<string, CopilotStateConfig> = {
  requesting: {
    Icon: Loader2,
    iconClass: 'pr-detail-spin',
    buttonClass: '',
    title: 'Requesting Copilot review…',
  },
  monitoring: {
    Icon: Sparkles,
    iconClass: 'pulse',
    buttonClass: ' pr-detail-copilot-monitoring',
    title: 'Waiting for Copilot review…',
  },
  done: {
    Icon: CheckCircle2,
    iconClass: '',
    buttonClass: ' pr-detail-copilot-done',
    title: 'Copilot review complete!',
  },
}

// --- Sub-components extracted for react-doctor component-size ---

function getCopilotStateConfig(state: string): CopilotStateConfig {
  return COPILOT_STATE_MAP[state] ?? COPILOT_STATE_DEFAULT
}

function CopilotReviewButtonIcon({ state }: { state: string }) {
  const { Icon, iconClass } = getCopilotStateConfig(state)
  return <Icon size={14} className={iconClass || undefined} />
}

function ApproveButton({
  youApproved,
  isApproving,
  onApprove,
}: {
  youApproved: boolean
  isApproving: boolean
  onApprove: () => void
}) {
  return (
    <button
      className={`pr-detail-refresh-btn${youApproved ? ' pr-detail-approved' : ''}`}
      onClick={onApprove}
      title={youApproved ? 'You approved this PR' : 'Approve PR'}
      disabled={youApproved || isApproving}
    >
      {isApproving ? <Loader2 size={14} className="spin" /> : <ThumbsUp size={14} />}
    </button>
  )
}

function NudgeButton({
  nudgeState,
  nudgeError,
  onNudge,
}: {
  nudgeState: 'idle' | 'sending' | 'sent' | 'error'
  nudgeError: string | null
  onNudge: () => void
}) {
  return (
    <button
      className={`pr-detail-refresh-btn${nudgeState === 'sent' ? ' pr-detail-nudge-sent' : ''}${nudgeState === 'error' ? ' pr-detail-nudge-error' : ''}`}
      onClick={onNudge}
      title={
        nudgeState === 'sent'
          ? 'Nudge sent!'
          : nudgeState === 'error'
            ? `Nudge failed: ${/* v8 ignore start */ nudgeError || 'unknown error' /* v8 ignore stop */}`
            : 'Nudge author via Slack'
      }
      disabled={nudgeState === 'sending' || nudgeState === 'sent'}
    >
      {nudgeState === 'sending' ? (
        <Loader2 size={14} className="spin" />
      ) : (
        <MessageSquare size={14} />
      )}
    </button>
  )
}

interface PRDetailHeaderProps {
  pr: PRDetailInfo
  stateLabel: string
  branches: { headBranch: string; baseBranch: string } | null
  copilotReviewState: string
  handleRequestCopilotReview: () => void
  onRefresh: () => void
  youApproved: boolean
  isApproving: boolean
  onApprove: () => void
  nudgeState: 'idle' | 'sending' | 'sent' | 'error'
  nudgeError: string | null
  onNudge: () => void
  onStartRalphReview: () => void
}

function PRDetailHeader({
  pr,
  stateLabel,
  branches,
  copilotReviewState,
  handleRequestCopilotReview,
  onRefresh,
  youApproved,
  isApproving,
  onApprove,
  nudgeState,
  nudgeError,
  onNudge,
  onStartRalphReview,
}: PRDetailHeaderProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const handleMoreClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setContextMenu({ x: rect.right - 180, y: rect.bottom + 4 })
  }

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
          className={`pr-detail-refresh-btn${getCopilotStateConfig(copilotReviewState).buttonClass}`}
          onClick={handleRequestCopilotReview}
          title={getCopilotStateConfig(copilotReviewState).title}
          disabled={copilotReviewState !== 'idle'}
        >
          <CopilotReviewButtonIcon state={copilotReviewState} />
        </button>
        <button className="pr-detail-refresh-btn" onClick={onRefresh} title="Refresh PR data">
          <RefreshCw size={14} />
        </button>
        <ApproveButton youApproved={youApproved} isApproving={isApproving} onApprove={onApprove} />
        <NudgeButton nudgeState={nudgeState} nudgeError={nudgeError} onNudge={onNudge} />
        <button className="pr-detail-refresh-btn" onClick={handleMoreClick} title="More actions">
          <MoreVertical size={14} />
        </button>
        <button className="pr-detail-open-btn" onClick={() => window.shell.openExternal(pr.url)}>
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>
      {contextMenu && (
        <PRDetailContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          youApproved={youApproved}
          copilotReviewState={copilotReviewState}
          nudgeState={nudgeState}
          onRequestCopilotReview={() => {
            handleRequestCopilotReview()
            setContextMenu(null)
          }}
          onApprove={() => {
            onApprove()
            setContextMenu(null)
          }}
          onNudge={() => {
            onNudge()
            setContextMenu(null)
          }}
          onRefresh={() => {
            onRefresh()
            setContextMenu(null)
          }}
          onCopyLink={() => {
            navigator.clipboard.writeText(pr.url)
            setContextMenu(null)
          }}
          onOpenExternal={() => {
            window.shell.openExternal(pr.url)
            setContextMenu(null)
          }}
          onStartRalphReview={() => {
            onStartRalphReview()
            setContextMenu(null)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
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

interface NudgeBannerProps {
  state: 'sent' | 'error'
  error: string | null
  author: string
  onDismiss: () => void
}

function NudgeBanner({ state, error, author, onDismiss }: NudgeBannerProps) {
  const isError = state === 'error'
  return (
    <div className={`pr-detail-nudge-banner${isError ? ' pr-detail-nudge-banner-error' : ''}`}>
      <div className="pr-detail-nudge-banner-content">
        {isError ? <X size={16} /> : <CheckCircle2 size={16} />}
        <div className="pr-detail-nudge-banner-text">
          {isError ? (
            <>
              <strong>Couldn&apos;t nudge {author}</strong>
              <span>{/* v8 ignore start */ error || 'Unknown error' /* v8 ignore stop */}</span>
            </>
          ) : (
            <>
              <strong>Nudge sent!</strong>
              <span>Slack message delivered to {author}</span>
            </>
          )}
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
            onKeyDown={onKeyboardActivate(() => window.shell.openExternal(effectiveIssue.url))}
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

function deriveBranchIssue(
  linkedIssues: PRLinkedIssue[],
  branches: { headBranch: string; baseBranch: string } | null,
  headBranch: string | undefined,
  ownerRepo: { owner: string; repo: string } | null
): { number: number; title: string; url: string } | null {
  /* v8 ignore start */
  if (linkedIssues.length > 0 || !ownerRepo) return null
  /* v8 ignore stop */
  const issueNum = parseIssueFromBranch(resolveHeadBranch(branches, headBranch))
  if (!issueNum) return null
  return {
    number: issueNum,
    title: '',
    url: `https://github.com/${ownerRepo.owner}/${ownerRepo.repo}/issues/${issueNum}`,
  }
}

function resolveUserApproval(
  history: PRHistorySummary,
  accounts: Array<{ username: string; org: string }>,
  namespace: string
): boolean {
  const scopedAccounts = namespace
    ? accounts.filter(account => account.org.toLowerCase() === namespace.toLowerCase())
    : []
  const candidateLogins = new Set(
    (scopedAccounts.length > 0 ? scopedAccounts : accounts).map(account =>
      account.username.toLowerCase()
    )
  )
  if (candidateLogins.size === 0) return false
  return history.reviewers.some(
    reviewer => reviewer.status === 'approved' && candidateLogins.has(reviewer.login.toLowerCase())
  )
}

interface PRSummarySectionProps {
  body: string | null
}

function PRSummarySection({ body }: PRSummarySectionProps) {
  if (!body?.trim()) return null
  return (
    <div className="pr-detail-summary">
      <div className="pr-detail-summary-title">
        <FileText size={14} />
        Summary
      </div>
      <MarkdownContent source={body} className="pr-detail-summary-body" />
    </div>
  )
}

interface SectionNoteBarProps {
  section: PRDetailSection
  sectionLabel: string
  prUrl: string
}

function SectionNoteBar({ section, sectionLabel, prUrl }: SectionNoteBarProps) {
  return (
    <div className="pr-detail-section-note">
      <span>Tree section: {sectionLabel}</span>
      {section === 'checks' && (
        <button
          className="pr-detail-open-btn"
          onClick={() => window.shell.openExternal(`${prUrl}/checks`)}
        >
          <ExternalLink size={14} />
          Open Checks
        </button>
      )}
      {section === 'files-changed' && (
        <button
          className="pr-detail-open-btn"
          onClick={() => window.shell.openExternal(`${prUrl}/files`)}
        >
          <ExternalLink size={14} />
          Open Files Changed
        </button>
      )}
    </div>
  )
}

interface FocusedSectionContentProps {
  section: PRDetailSection
  pr: PRDetailInfo
  refreshKey: number
  onHistoryLoaded: (history: PRHistorySummary) => void
}

function FocusedSectionContent({
  section,
  pr,
  refreshKey,
  onHistoryLoaded,
}: FocusedSectionContentProps) {
  switch (section) {
    case 'conversation':
      return <PRThreadsPanel key={refreshKey} pr={pr} />
    case 'commits':
      return (
        <PullRequestHistoryPanel
          key={refreshKey}
          pr={pr}
          embedded
          focus="commits"
          onLoaded={onHistoryLoaded}
        />
      )
    case 'checks':
      return <PRChecksPanel key={refreshKey} pr={pr} />
    case 'files-changed':
      return <PRFilesChangedPanel key={refreshKey} pr={pr} />
    case 'ai-reviews':
      return <PRReviewsPanel key={refreshKey} pr={pr} />
  }
}

function resolveActivityDates(
  pr: PRDetailInfo,
  historyUpdatedAt: string | null
): { activityAt: string | null; activityRelative: string; createdRelative: string } {
  const activityAt = historyUpdatedAt || pr.updatedAt || pr.date || pr.created
  const activityRelative = activityAt ? formatDistanceToNow(activityAt) : ''
  const createdRelative = pr.created ? formatDistanceToNow(pr.created) : ''
  return { activityAt, activityRelative, createdRelative }
}

function resolveLabelsAndIssue(
  pr: PRDetailInfo,
  section: PRDetailSection | null,
  linkedIssues: PRLinkedIssue[],
  branches: { headBranch: string; baseBranch: string } | null,
  ownerRepo: { owner: string; repo: string } | null
): {
  stateLabel: string
  sectionLabel: string | null
  isFocusedSection: boolean
  effectiveIssue: { number: number; url: string } | null
} {
  const stateLabel = pr.state?.trim() || 'open'
  const sectionLabel = section ? (SECTION_LABELS[section] ?? null) : null
  const isFocusedSection = section !== null
  const effectiveIssue =
    linkedIssues[0] ?? deriveBranchIssue(linkedIssues, branches, pr.headBranch, ownerRepo)
  return { stateLabel, sectionLabel, isFocusedSection, effectiveIssue }
}

export function PullRequestDetailPanel(props: PullRequestDetailPanelProps) {
  const { pr } = props
  const section = props.section ?? null
  const { accounts } = useGitHubAccounts()
  const { enqueue } = useTaskQueue('github')
  const enqueueRef = useRef(enqueue)
  const ownerRepo = useMemo(() => parseOwnerRepoFromUrl(pr.url) ?? null, [pr.url])

  const { data: prBody } = usePRPanelData<string>(pr, 'pr-body', (client, owner, repo, prNumber) =>
    client.fetchPRBody(owner, repo, prNumber)
  )

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
  const [isApproving, setIsApproving] = useState(false)
  const [linkedIssues, setLinkedIssues] = useState<PRLinkedIssue[]>([])
  const [nudgeState, setNudgeState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [nudgeError, setNudgeError] = useState<string | null>(null)
  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  useEffect(() => {
    setYouApproved(pr.iApproved)
  }, [pr.id, pr.url, pr.iApproved])

  useEffect(() => {
    setHistoryUpdatedAt(null)
    setLinkedIssues([])
    setNudgeState('idle')
    setNudgeError(null)
  }, [pr.id, pr.repository, pr.url])

  const fetchBranches = useCallback(async () => {
    if (pr.headBranch && pr.baseBranch) {
      setBranches({ headBranch: pr.headBranch, baseBranch: pr.baseBranch })
      return
    }

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
    } catch (_: unknown) {
      setBranches(null)
    }
  }, [accounts, ownerRepo, pr.id, pr.repository, pr.headBranch, pr.baseBranch])

  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  const { activityAt, activityRelative, createdRelative } = resolveActivityDates(
    pr,
    historyUpdatedAt
  )
  const { stateLabel, sectionLabel, isFocusedSection, effectiveIssue } = resolveLabelsAndIssue(
    pr,
    section,
    linkedIssues,
    branches,
    ownerRepo
  )

  const handleHistoryLoaded = useCallback(
    (history: PRHistorySummary) => {
      setHistoryUpdatedAt(history.updatedAt || null)
      setLinkedIssues(history.linkedIssues)
      const namespace = pr.org || ownerRepo?.owner || ''
      setYouApproved(resolveUserApproval(history, accounts, namespace))
    },
    [accounts, ownerRepo, pr.org]
  )

  const handleApprovePR = useCallback(async () => {
    if (!ownerRepo || youApproved || isApproving) return
    setIsApproving(true)
    try {
      await enqueueRef.current(
        async signal => {
          throwIfAborted(signal)
          const client = new GitHubClient({ accounts }, 7)
          await client.approvePullRequest(ownerRepo.owner, ownerRepo.repo, pr.id)
        },
        { name: `pr-approve-${pr.repository}-${pr.id}` }
      )
      setYouApproved(true)
    } finally {
      setIsApproving(false)
    }
  }, [accounts, ownerRepo, pr.id, pr.repository, youApproved, isApproving])

  const handleNudgeAuthor = useCallback(async () => {
    /* v8 ignore start -- button is disabled in sending/sent states */
    if (nudgeState === 'sending' || nudgeState === 'sent') return
    /* v8 ignore stop */
    setNudgeState('sending')
    setNudgeError(null)
    try {
      const result = await window.slack.nudgeAuthor({
        githubLogin: pr.author,
        prTitle: pr.title,
        prUrl: pr.url,
      })
      if (result.success) {
        setNudgeState('sent')
      } else {
        console.warn('[Nudge] Failed:', result.error)
        setNudgeError(result.error || 'Unknown error')
        setNudgeState('error')
        setTimeout(() => setNudgeState('idle'), 5000)
      }
    } catch (err: unknown) {
      console.error('[Nudge] Error:', err)
      setNudgeError(String(err))
      setNudgeState('error')
      setTimeout(() => setNudgeState('idle'), 5000)
    }
  }, [nudgeState, pr.author, pr.title, pr.url])

  return (
    <div className="pr-detail-container">
      <PRDetailHeader
        pr={pr}
        stateLabel={stateLabel}
        branches={branches}
        copilotReviewState={copilotReviewState}
        handleRequestCopilotReview={handleRequestCopilotReview}
        onRefresh={() => setRefreshKey(k => k + 1)}
        youApproved={youApproved}
        isApproving={isApproving}
        onApprove={handleApprovePR}
        nudgeState={nudgeState}
        nudgeError={nudgeError}
        onNudge={handleNudgeAuthor}
        onStartRalphReview={() => {
          const org = pr.org || ownerRepo?.owner || ''
          const repoRoot = accounts.find(a => a.org === org)?.repoRoot
          const repoPath = repoRoot ? `${repoRoot}\\${pr.repository}` : ''
          window.dispatchEvent(
            new CustomEvent('app:navigate', { detail: { viewId: 'ralph-dashboard' } })
          )
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('ralph:launch-pr-review', {
                detail: { prNumber: pr.id, repository: pr.repository, org, repoPath },
              })
            )
          }, 100)
        }}
      />

      <div className="pr-detail-body">
        {copilotReviewBanner && (
          <CopilotReviewBanner
            completedAt={copilotReviewBanner.completedAt}
            onDismiss={() => {
              setCopilotReviewBanner(null)
              clearPendingReview(pr.url)
            }}
          />
        )}

        {(nudgeState === 'sent' || nudgeState === 'error') && (
          <NudgeBanner
            state={nudgeState}
            error={nudgeError}
            author={pr.author}
            onDismiss={() => {
              setNudgeState('idle')
              setNudgeError(null)
            }}
          />
        )}

        {sectionLabel && (
          <SectionNoteBar section={section!} sectionLabel={sectionLabel} prUrl={pr.url} />
        )}

        {isFocusedSection ? (
          <FocusedSectionContent
            section={section!}
            pr={pr}
            refreshKey={refreshKey}
            onHistoryLoaded={handleHistoryLoaded}
          />
        ) : (
          <>
            <PROverviewSection
              pr={pr}
              youApproved={youApproved}
              effectiveIssue={effectiveIssue}
              createdRelative={createdRelative}
              activityRelative={activityRelative}
              activityAt={activityAt}
            />
            <PRSummarySection body={prBody} />
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
    </div>
  )
}
