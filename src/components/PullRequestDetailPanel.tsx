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
import {
  useAIReviewMonitor,
  clearPendingAIReview,
  type AIReviewState,
} from '../hooks/useAIReviewMonitor'
import { codeRabbitProvider } from '../reviewProviders'
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

function resolveSourceLabel(pr: PRDetailInfo): string {
  if (pr.org) return pr.org
  return pr.source
}

function BranchFlow({ branches }: { branches: { headBranch: string; baseBranch: string } | null }) {
  if (!branches) return null
  if (!branches.baseBranch) return null
  if (!branches.headBranch) return null

  return (
    <>
      <span className="pr-detail-dot">·</span>
      <span className="pr-detail-branch-flow">
        <GitBranch size={12} />
        into <strong>{branches.baseBranch}</strong> from <strong>{branches.headBranch}</strong>
      </span>
    </>
  )
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

function getNudgeClassName(state: 'idle' | 'sending' | 'sent' | 'error'): string {
  const base = 'pr-detail-refresh-btn'
  if (state === 'sent') return `${base} pr-detail-nudge-sent`
  if (state === 'error') return `${base} pr-detail-nudge-error`
  return base
}

function getNudgeTitle(state: 'idle' | 'sending' | 'sent' | 'error', error: string | null): string {
  if (state === 'sent') return 'Nudge sent!'
  if (state === 'error')
    return `Nudge failed: ${/* v8 ignore start */ error || 'unknown error' /* v8 ignore stop */}`
  return 'Nudge author via Slack'
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
      className={getNudgeClassName(nudgeState)}
      onClick={onNudge}
      title={getNudgeTitle(nudgeState, nudgeError)}
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

interface AIReviewProviderEntry {
  id: string
  name: string
  state: AIReviewState
  onRequest: () => void
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
  aiReviewProviders: AIReviewProviderEntry[]
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
  aiReviewProviders,
}: PRDetailHeaderProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const sourceLabel = resolveSourceLabel(pr)
  const copilotStateConfig = getCopilotStateConfig(copilotReviewState)

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
          <span>{sourceLabel}</span>
          <span className="pr-detail-dot">·</span>
          <span>{pr.repository}</span>
          <BranchFlow branches={branches} />
        </div>
      </div>
      <div className="pr-detail-header-actions">
        <button
          className={`pr-detail-refresh-btn${copilotStateConfig.buttonClass}`}
          onClick={handleRequestCopilotReview}
          title={copilotStateConfig.title}
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
          aiReviewProviders={aiReviewProviders.map(p => ({
            ...p,
            onRequest: () => {
              p.onRequest()
              setContextMenu(null)
            },
          }))}
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

interface AIReviewBannerProps {
  providerName: string
  completedAt: number
  onDismiss: () => void
}

function AIReviewBanner({ providerName, completedAt, onDismiss }: AIReviewBannerProps) {
  return (
    <div className="pr-detail-review-banner">
      <div className="pr-detail-review-banner-content">
        <CheckCircle2 size={16} />
        <div className="pr-detail-review-banner-text">
          <strong>{providerName} review complete</strong>
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

function resolveApprovalTargetLabel(assigneeCount: number): string {
  if (assigneeCount > 0) return String(assigneeCount)
  return '?'
}

function resolveApprovalStatusLabel(youApproved: boolean): string {
  if (youApproved) return 'Yes'
  return 'No'
}

function RelativeMetaText({ value }: { value: string }) {
  if (!value) return null
  return <span className="pr-detail-meta-relative">({value})</span>
}

function AuthorMetaValue({
  author,
  authorAvatarUrl,
}: {
  author: string
  authorAvatarUrl?: string
}) {
  return (
    <div className="pr-detail-meta-value">
      {authorAvatarUrl ? (
        <img src={authorAvatarUrl} alt={author} className="pr-detail-avatar" />
      ) : null}
      <span className="pr-detail-author-text">{author}</span>
    </div>
  )
}

function LinkedIssueCard({
  effectiveIssue,
}: {
  effectiveIssue: { number: number; url: string } | null
}) {
  if (!effectiveIssue) {
    return (
      <div className="pr-detail-card" title="No linked issue">
        <div className="pr-detail-card-title">
          <CircleDot size={12} />
          Linked Issue
        </div>
        <div className="pr-detail-card-value">
          <span className="pr-detail-card-secondary">None</span>
        </div>
      </div>
    )
  }

  return (
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
  )
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
            {pr.approvalCount}/{resolveApprovalTargetLabel(pr.assigneeCount)}
          </div>
        </div>
        <div className="pr-detail-card">
          <div className="pr-detail-card-title">You Approved</div>
          <div className="pr-detail-card-value">{resolveApprovalStatusLabel(youApproved)}</div>
        </div>
        <LinkedIssueCard effectiveIssue={effectiveIssue} />
      </div>

      <div className="pr-detail-meta-list">
        <div className="pr-detail-meta-item pr-detail-meta-item-author">
          <div className="pr-detail-meta-label">
            <User size={14} />
            Author
          </div>
          <AuthorMetaValue author={pr.author} authorAvatarUrl={pr.authorAvatarUrl} />
        </div>
        <div className="pr-detail-meta-item">
          <div className="pr-detail-meta-label">
            <Clock size={14} />
            Created
            <RelativeMetaText value={createdRelative} />
          </div>
          <div className="pr-detail-meta-value">{formatDateFull(pr.created)}</div>
        </div>
        <div className="pr-detail-meta-item">
          <div className="pr-detail-meta-label">
            <Check size={14} />
            Last Activity
            <RelativeMetaText value={activityRelative} />
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
  accounts: { username: string; org: string; repoRoot?: string }[],
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

const FOCUSED_SECTION_RENDERERS: Record<
  PRDetailSection,
  (props: FocusedSectionContentProps) => React.ReactNode
> = {
  conversation: ({ pr, refreshKey }) => <PRThreadsPanel key={refreshKey} pr={pr} />,
  commits: ({ pr, refreshKey, onHistoryLoaded }) => (
    <PullRequestHistoryPanel
      key={refreshKey}
      pr={pr}
      embedded
      focus="commits"
      onLoaded={onHistoryLoaded}
    />
  ),
  checks: ({ pr, refreshKey }) => <PRChecksPanel key={refreshKey} pr={pr} />,
  'files-changed': ({ pr, refreshKey }) => <PRFilesChangedPanel key={refreshKey} pr={pr} />,
  'ai-reviews': ({ pr, refreshKey }) => <PRReviewsPanel key={refreshKey} pr={pr} />,
}

function FocusedSectionContent(props: FocusedSectionContentProps) {
  const renderSection = FOCUSED_SECTION_RENDERERS[props.section]
  if (!renderSection) return null
  return renderSection(props)
}

function resolveNamespace(org: string | undefined, owner: string | undefined): string {
  if (org) return org
  if (owner) return owner
  return ''
}

function resolveFirstAvailableDate(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value) return value
  }
  return null
}

function formatRelativeTimestamp(value: string | null | undefined): string {
  if (!value) return ''
  return formatDistanceToNow(value)
}

function resolveActivityDates(
  pr: PRDetailInfo,
  historyUpdatedAt: string | null
): { activityAt: string | null; activityRelative: string; createdRelative: string } {
  const activityAt = resolveFirstAvailableDate([
    historyUpdatedAt,
    pr.updatedAt,
    pr.date,
    pr.created,
  ])
  const activityRelative = formatRelativeTimestamp(activityAt)
  const createdRelative = formatRelativeTimestamp(pr.created)
  return { activityAt, activityRelative, createdRelative }
}

function resolveStateLabel(state: string): string {
  const trimmedState = state.trim()
  if (!trimmedState) return 'open'
  return trimmedState
}

function resolveSectionLabel(section: PRDetailSection | null): string | null {
  if (section === null) return null
  return SECTION_LABELS[section]
}

function resolveEffectiveIssue(
  linkedIssues: PRLinkedIssue[],
  branches: { headBranch: string; baseBranch: string } | null,
  headBranch: string | undefined,
  ownerRepo: { owner: string; repo: string } | null
): { number: number; url: string } | null {
  const linkedIssue = linkedIssues[0]
  if (linkedIssue) return linkedIssue
  return deriveBranchIssue(linkedIssues, branches, headBranch, ownerRepo)
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
  const stateLabel = resolveStateLabel(pr.state)
  const sectionLabel = resolveSectionLabel(section)
  const isFocusedSection = section !== null
  const effectiveIssue = resolveEffectiveIssue(linkedIssues, branches, pr.headBranch, ownerRepo)
  return { stateLabel, sectionLabel, isFocusedSection, effectiveIssue }
}

function getInitialBranches(pr: PRDetailInfo): { headBranch: string; baseBranch: string } | null {
  return pr.headBranch && pr.baseBranch
    ? { headBranch: pr.headBranch, baseBranch: pr.baseBranch }
    : null
}

function isNudgeLocked(state: 'idle' | 'sending' | 'sent' | 'error'): boolean {
  if (state === 'sending') return true
  if (state === 'sent') return true
  return false
}

function resolveNudgeFailureMessage(error: string | null | undefined): string {
  if (error) return error
  return 'Unknown error'
}

function resolveRepoRoot(
  accounts: { username: string; org: string; repoRoot?: string }[],
  org: string
): string {
  const account = accounts.find(candidate => candidate.org === org)
  if (!account) return ''
  if (!account.repoRoot) return ''
  return account.repoRoot
}

function buildRepoPath(repoRoot: string, repository: string): string {
  if (!repoRoot) return ''
  return `${repoRoot}\\${repository}`
}

interface DetailBannersProps {
  copilotReviewBanner: { completedAt: number } | null
  onDismissCopilot: () => void
  codeRabbitReviewBanner: { completedAt: number } | null
  onDismissCodeRabbit: () => void
  nudgeState: 'idle' | 'sending' | 'sent' | 'error'
  nudgeError: string | null
  prAuthor: string
  onDismissNudge: () => void
}

function DetailBanners({
  copilotReviewBanner,
  onDismissCopilot,
  codeRabbitReviewBanner,
  onDismissCodeRabbit,
  nudgeState,
  nudgeError,
  prAuthor,
  onDismissNudge,
}: DetailBannersProps) {
  return (
    <>
      {copilotReviewBanner && (
        <CopilotReviewBanner
          completedAt={copilotReviewBanner.completedAt}
          onDismiss={onDismissCopilot}
        />
      )}
      {codeRabbitReviewBanner && (
        <AIReviewBanner
          providerName={codeRabbitProvider.name}
          completedAt={codeRabbitReviewBanner.completedAt}
          onDismiss={onDismissCodeRabbit}
        />
      )}
      {(nudgeState === 'sent' || nudgeState === 'error') && (
        <NudgeBanner
          state={nudgeState}
          error={nudgeError}
          author={prAuthor}
          onDismiss={onDismissNudge}
        />
      )}
    </>
  )
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

  const {
    reviewState: codeRabbitReviewState,
    reviewBanner: codeRabbitReviewBanner,
    setReviewBanner: setCodeRabbitReviewBanner,
    handleRequestReview: handleRequestCodeRabbitReview,
  } = useAIReviewMonitor({
    provider: codeRabbitProvider,
    prId: pr.id,
    prUrl: pr.url,
    ownerRepo,
  })

  const aiReviewProviders = useMemo(
    () => [
      {
        id: codeRabbitProvider.id,
        name: codeRabbitProvider.name,
        state: codeRabbitReviewState,
        onRequest: handleRequestCodeRabbitReview,
      },
    ],
    [codeRabbitReviewState, handleRequestCodeRabbitReview]
  )

  const [branches, setBranches] = useState<{ headBranch: string; baseBranch: string } | null>(
    getInitialBranches(pr)
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
      const namespace = resolveNamespace(pr.org, ownerRepo?.owner)
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
    if (isNudgeLocked(nudgeState)) return
    /* v8 ignore stop */

    const failNudge = (message: string) => {
      setNudgeError(message)
      setNudgeState('error')
      setTimeout(() => setNudgeState('idle'), 5000)
    }

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
        return
      }

      console.warn('[Nudge] Failed:', result.error)
      failNudge(resolveNudgeFailureMessage(result.error))
    } catch (err: unknown) {
      console.error('[Nudge] Error:', err)
      failNudge(String(err))
    }
  }, [nudgeState, pr.author, pr.title, pr.url])

  const handleStartRalphReview = useCallback(() => {
    const org = resolveNamespace(pr.org, ownerRepo?.owner)
    const repoRoot = resolveRepoRoot(accounts, org)
    const repoPath = buildRepoPath(repoRoot, pr.repository)
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: 'ralph-dashboard' } }))
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('ralph:launch-pr-review', {
          detail: { prNumber: pr.id, repository: pr.repository, org, repoPath },
        })
      )
    }, 100)
  }, [accounts, ownerRepo, pr.id, pr.org, pr.repository])

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
        aiReviewProviders={aiReviewProviders}
        onStartRalphReview={handleStartRalphReview}
      />

      <div className="pr-detail-body">
        <DetailBanners
          copilotReviewBanner={copilotReviewBanner}
          onDismissCopilot={() => {
            setCopilotReviewBanner(null)
            clearPendingReview(pr.url)
          }}
          codeRabbitReviewBanner={codeRabbitReviewBanner}
          onDismissCodeRabbit={() => {
            setCodeRabbitReviewBanner(null)
            clearPendingAIReview(codeRabbitProvider.id, pr.url)
          }}
          nudgeState={nudgeState}
          nudgeError={nudgeError}
          prAuthor={pr.author}
          onDismissNudge={() => {
            setNudgeState('idle')
            setNudgeError(null)
          }}
        />

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
