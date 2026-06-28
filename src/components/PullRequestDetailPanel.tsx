import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
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
import { GitHubClient } from '../api/github/client'
import type { PRHistorySummary, PRLinkedIssue } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import { useTaskQueue } from '../hooks/useTaskQueue'
import { usePRPanelData } from '../hooks/usePRPanelData'
import { useCopilotReviewMonitor, clearPendingReview } from '../hooks/useCopilotReviewMonitor'
import {
  useAIReviewMonitor,
  clearPendingAIReview,
  type AIReviewState,
} from '../hooks/useAIReviewMonitor'
import { codeRabbitProvider } from '../reviewProviders/codeRabbitProvider'
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

const COPILOT_STATE_REQUESTING: CopilotStateConfig = {
  Icon: Loader2,
  iconClass: 'pr-detail-spin',
  buttonClass: '',
  title: 'Requesting Copilot review…',
}

const COPILOT_STATE_MONITORING: CopilotStateConfig = {
  Icon: Sparkles,
  iconClass: 'pulse',
  buttonClass: ' pr-detail-copilot-monitoring',
  title: 'Waiting for Copilot review…',
}

const COPILOT_STATE_DONE: CopilotStateConfig = {
  Icon: CheckCircle2,
  iconClass: '',
  buttonClass: ' pr-detail-copilot-done',
  title: 'Copilot review complete!',
}

// --- Sub-components extracted for react-doctor component-size ---

function getCopilotStateConfig(state: string): CopilotStateConfig {
  switch (state) {
    case 'requesting':
      return COPILOT_STATE_REQUESTING
    case 'monitoring':
      return COPILOT_STATE_MONITORING
    case 'done':
      return COPILOT_STATE_DONE
    default:
      return COPILOT_STATE_DEFAULT
  }
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
      type="button"
      className={`pr-detail-refresh-btn${youApproved ? ' pr-detail-approved' : ''}`}
      onClick={onApprove}
      title={youApproved ? 'You approved this PR' : 'Approve PR'}
      disabled={youApproved || isApproving}
    >
      {isApproving ? <Loader2 size={14} className="spin" /> : <ThumbsUp size={14} />}
    </button>
  )
}

function nudgeButtonTitle(nudgeState: string, nudgeError: string | null): string {
  if (nudgeState === 'sent') return 'Nudge sent!'
  if (nudgeState === 'error')
    return `Nudge failed: ${/* v8 ignore start */ nudgeError || 'unknown error' /* v8 ignore stop */}`
  return 'Nudge author via Slack'
}

function nudgeButtonClass(nudgeState: string): string {
  if (nudgeState === 'sent') return 'pr-detail-refresh-btn pr-detail-nudge-sent'
  if (nudgeState === 'error') return 'pr-detail-refresh-btn pr-detail-nudge-error'
  return 'pr-detail-refresh-btn'
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
      type="button"
      className={nudgeButtonClass(nudgeState)}
      onClick={onNudge}
      title={nudgeButtonTitle(nudgeState, nudgeError)}
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

function PRBranchFlow({ branches }: { branches: PRDetailHeaderProps['branches'] }) {
  if (!branches?.baseBranch || !branches.headBranch) return null
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

function closeAfter(action: () => void, close: () => void): () => void {
  return () => {
    action()
    close()
  }
}

function buildMenuReviewProviders(
  providers: AIReviewProviderEntry[],
  close: () => void
): AIReviewProviderEntry[] {
  return providers.map(provider => ({
    ...provider,
    onRequest: closeAfter(provider.onRequest, close),
  }))
}

interface PRDetailHeaderContextMenuProps {
  contextMenu: { x: number; y: number } | null
  youApproved: boolean
  copilotReviewState: string
  nudgeState: PRDetailHeaderProps['nudgeState']
  aiReviewProviders: AIReviewProviderEntry[]
  prUrl: string
  onRequestCopilotReview: () => void
  onApprove: () => void
  onNudge: () => void
  onRefresh: () => void
  onStartRalphReview: () => void
  onClose: () => void
}

function PRDetailHeaderContextMenu({
  contextMenu,
  youApproved,
  copilotReviewState,
  nudgeState,
  aiReviewProviders,
  prUrl,
  onRequestCopilotReview,
  onApprove,
  onNudge,
  onRefresh,
  onStartRalphReview,
  onClose,
}: PRDetailHeaderContextMenuProps) {
  if (!contextMenu) return null
  return (
    <PRDetailContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      youApproved={youApproved}
      copilotReviewState={copilotReviewState}
      nudgeState={nudgeState}
      aiReviewProviders={buildMenuReviewProviders(aiReviewProviders, onClose)}
      onRequestCopilotReview={closeAfter(onRequestCopilotReview, onClose)}
      onApprove={closeAfter(onApprove, onClose)}
      onNudge={closeAfter(onNudge, onClose)}
      onRefresh={closeAfter(onRefresh, onClose)}
      onCopyLink={closeAfter(() => navigator.clipboard.writeText(prUrl), onClose)}
      onOpenExternal={closeAfter(() => window.shell.openExternal(prUrl), onClose)}
      onStartRalphReview={closeAfter(onStartRalphReview, onClose)}
      onClose={onClose}
    />
  )
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
  const copilotStateConfig = getCopilotStateConfig(copilotReviewState)
  const closeContextMenu = () => setContextMenu(null)

  const handleMoreClick = (e: MouseEvent) => {
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
          <PRBranchFlow branches={branches} />
        </div>
      </div>
      <div className="pr-detail-header-actions">
        <button
          type="button"
          className={`pr-detail-refresh-btn${copilotStateConfig.buttonClass}`}
          onClick={handleRequestCopilotReview}
          title={copilotStateConfig.title}
          disabled={copilotReviewState !== 'idle'}
        >
          <CopilotReviewButtonIcon state={copilotReviewState} />
        </button>
        <button
          aria-label="Refresh PR data"
          type="button"
          className="pr-detail-refresh-btn"
          onClick={onRefresh}
          title="Refresh PR data"
        >
          <RefreshCw size={14} />
        </button>
        <ApproveButton youApproved={youApproved} isApproving={isApproving} onApprove={onApprove} />
        <NudgeButton nudgeState={nudgeState} nudgeError={nudgeError} onNudge={onNudge} />
        <button
          aria-label="More actions"
          type="button"
          className="pr-detail-refresh-btn"
          onClick={handleMoreClick}
          title="More actions"
        >
          <MoreVertical size={14} />
        </button>
        <button
          type="button"
          className="pr-detail-open-btn"
          onClick={() => window.shell.openExternal(pr.url)}
        >
          <ExternalLink size={14} />
          Open on GitHub
        </button>
      </div>
      <PRDetailHeaderContextMenu
        contextMenu={contextMenu}
        youApproved={youApproved}
        copilotReviewState={copilotReviewState}
        nudgeState={nudgeState}
        aiReviewProviders={aiReviewProviders}
        prUrl={pr.url}
        onRequestCopilotReview={handleRequestCopilotReview}
        onApprove={onApprove}
        onNudge={onNudge}
        onRefresh={onRefresh}
        onStartRalphReview={onStartRalphReview}
        onClose={closeContextMenu}
      />
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
          <span>Finished {formatDistanceToNow(completedAt)}, page refreshed with latest data</span>
        </div>
      </div>
      <button
        aria-label="Dismiss"
        type="button"
        className="pr-detail-review-banner-dismiss"
        onClick={onDismiss}
        title="Dismiss"
      >
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
          <span>Finished {formatDistanceToNow(completedAt)}, page refreshed with latest data</span>
        </div>
      </div>
      <button
        aria-label="Dismiss"
        type="button"
        className="pr-detail-review-banner-dismiss"
        onClick={onDismiss}
        title="Dismiss"
      >
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
      <button
        aria-label="Dismiss"
        type="button"
        className="pr-detail-review-banner-dismiss"
        onClick={onDismiss}
        title="Dismiss"
      >
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

function PRMetricCard({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div className="pr-detail-card">
      <div className="pr-detail-card-title">{title}</div>
      <div className="pr-detail-card-value">{value}</div>
    </div>
  )
}

function LinkedIssueMetricCard({ issue }: { issue: PROverviewSectionProps['effectiveIssue'] }) {
  if (!issue) {
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
      onClick={() => window.shell.openExternal(issue.url)}
      onKeyDown={onKeyboardActivate(() => window.shell.openExternal(issue.url))}
      title={`Open Issue #${issue.number} on GitHub`}
    >
      <div className="pr-detail-card-title">
        <CircleDot size={12} />
        Linked Issue
      </div>
      <div className="pr-detail-card-value">
        <span className="pr-detail-linked-issue">#{issue.number}</span>
      </div>
    </button>
  )
}

function AuthorMetaItem({ pr }: { pr: PRDetailInfo }) {
  return (
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
  )
}

function RelativeMetaItem({
  icon,
  label,
  relative,
  value,
}: {
  icon: ReactNode
  label: string
  relative: string
  value: string | null
}) {
  return (
    <div className="pr-detail-meta-item">
      <div className="pr-detail-meta-label">
        {icon}
        {label}
        {relative && <span className="pr-detail-meta-relative">({relative})</span>}
      </div>
      <div className="pr-detail-meta-value">{formatDateFull(value)}</div>
    </div>
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
        <PRMetricCard title="Status" value={<span className="pr-detail-state">{pr.state}</span>} />
        <PRMetricCard
          title="Approvals"
          value={`${pr.approvalCount}/${pr.assigneeCount > 0 ? pr.assigneeCount : '?'}`}
        />
        <PRMetricCard title="You Approved" value={youApproved ? 'Yes' : 'No'} />
        <LinkedIssueMetricCard issue={effectiveIssue} />
      </div>

      <div className="pr-detail-meta-list">
        <AuthorMetaItem pr={pr} />
        <RelativeMetaItem
          icon={<Clock size={14} />}
          label="Created"
          relative={createdRelative}
          value={pr.created}
        />
        <RelativeMetaItem
          icon={<Check size={14} />}
          label="Last Activity"
          relative={activityRelative}
          value={activityAt}
        />
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
          type="button"
          className="pr-detail-open-btn"
          onClick={() => window.shell.openExternal(`${prUrl}/checks`)}
        >
          <ExternalLink size={14} />
          Open Checks
        </button>
      )}
      {section === 'files-changed' && (
        <button
          type="button"
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

type FocusedSectionRenderer = (props: FocusedSectionContentProps) => ReactNode

const FOCUSED_SECTION_RENDERERS: Partial<Record<PRDetailSection, FocusedSectionRenderer>> = {
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

function FocusedSectionContent({
  section,
  pr,
  refreshKey,
  onHistoryLoaded,
}: FocusedSectionContentProps) {
  const render = FOCUSED_SECTION_RENDERERS[section]
  return render?.({ section, pr, refreshKey, onHistoryLoaded }) ?? null
}

function resolveActivityAt(pr: PRDetailInfo, historyUpdatedAt: string | null): string | null {
  return historyUpdatedAt || pr.updatedAt || pr.date || pr.created
}

function formatRelativeDate(date: string | null | undefined): string {
  return date ? formatDistanceToNow(date) : ''
}

function resolveActivityDates(
  pr: PRDetailInfo,
  historyUpdatedAt: string | null
): { activityAt: string | null; activityRelative: string; createdRelative: string } {
  const activityAt = resolveActivityAt(pr, historyUpdatedAt)
  const activityRelative = formatRelativeDate(activityAt)
  const createdRelative = formatRelativeDate(pr.created)
  return { activityAt, activityRelative, createdRelative }
}

function resolveSectionLabel(section: PRDetailSection | null): string | null {
  return section ? (SECTION_LABELS[section] ?? null) : null
}

function resolveEffectiveIssue(
  pr: PRDetailInfo,
  linkedIssues: PRLinkedIssue[],
  branches: { headBranch: string; baseBranch: string } | null,
  ownerRepo: { owner: string; repo: string } | null
): { number: number; url: string } | null {
  return linkedIssues[0] ?? deriveBranchIssue(linkedIssues, branches, pr.headBranch, ownerRepo)
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
  const sectionLabel = resolveSectionLabel(section)
  const isFocusedSection = section !== null
  const effectiveIssue = resolveEffectiveIssue(pr, linkedIssues, branches, ownerRepo)
  return { stateLabel, sectionLabel, isFocusedSection, effectiveIssue }
}

function initialBranches(pr: PRDetailInfo): { headBranch: string; baseBranch: string } | null {
  if (pr.headBranch && pr.baseBranch) {
    return { headBranch: pr.headBranch, baseBranch: pr.baseBranch }
  }
  return null
}

interface PRDetailBannersProps {
  copilotReviewBanner: { completedAt: number } | null
  onDismissCopilot: () => void
  codeRabbitReviewBanner: { completedAt: number } | null
  onDismissCodeRabbit: () => void
  nudgeState: 'idle' | 'sending' | 'sent' | 'error'
  nudgeError: string | null
  author: string
  onDismissNudge: () => void
}

function PRDetailBanners({
  copilotReviewBanner,
  onDismissCopilot,
  codeRabbitReviewBanner,
  onDismissCodeRabbit,
  nudgeState,
  nudgeError,
  author,
  onDismissNudge,
}: PRDetailBannersProps) {
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
          author={author}
          onDismiss={onDismissNudge}
        />
      )}
    </>
  )
}

type OwnerRepo = { owner: string; repo: string }
type PRBranches = { headBranch: string; baseBranch: string }

function getKnownBranches(
  headBranch: string | undefined,
  baseBranch: string | undefined
): PRBranches | null {
  if (!headBranch || !baseBranch) return null
  return { headBranch, baseBranch }
}

async function fetchPRBranchesFromGitHub({
  enqueue,
  accounts,
  ownerRepo,
  prId,
  repository,
}: {
  enqueue: ReturnType<typeof useTaskQueue>['enqueue']
  accounts: ReturnType<typeof useGitHubAccounts>['accounts']
  ownerRepo: OwnerRepo
  prId: number
  repository: string
}): Promise<PRBranches> {
  return enqueue(
    async signal => {
      throwIfAborted(signal)
      const client = new GitHubClient({ accounts }, 7)
      return await client.fetchPRBranches(ownerRepo.owner, ownerRepo.repo, prId)
    },
    { name: `pr-branches-${repository}-${prId}` }
  )
}

function isNudgeBusy(state: 'idle' | 'sending' | 'sent' | 'error'): boolean {
  return state === 'sending' || state === 'sent'
}

function setNudgeFailure(
  message: string,
  setNudgeState: (state: 'idle' | 'sending' | 'sent' | 'error') => void,
  setNudgeError: (error: string | null) => void
): void {
  setNudgeError(message)
  setNudgeState('error')
  setTimeout(() => setNudgeState('idle'), 5000)
}

function applyNudgeResult(
  result: Awaited<ReturnType<typeof window.slack.nudgeAuthor>>,
  setNudgeState: (state: 'idle' | 'sending' | 'sent' | 'error') => void,
  setNudgeError: (error: string | null) => void
): void {
  if (result.success) {
    setNudgeState('sent')
    return
  }
  console.warn('[Nudge] Failed:', result.error)
  setNudgeFailure(result.error || 'Unknown error', setNudgeState, setNudgeError)
}

function resolveRalphReviewOrg(pr: PRDetailInfo, ownerRepo: OwnerRepo | null): string {
  return pr.org || ownerRepo?.owner || ''
}

function resolveRalphReviewRepoPath(
  org: string,
  repository: string,
  accounts: ReturnType<typeof useGitHubAccounts>['accounts']
): string {
  const repoRoot = accounts.find(a => a.org.toLowerCase() === org.toLowerCase())?.repoRoot
  return repoRoot ? `${repoRoot.replace(/[\\/]$/, '')}/${repository}` : ''
}

function startRalphPRReview(
  pr: PRDetailInfo,
  ownerRepo: OwnerRepo | null,
  accounts: ReturnType<typeof useGitHubAccounts>['accounts']
): void {
  const org = resolveRalphReviewOrg(pr, ownerRepo)
  const repoPath = resolveRalphReviewRepoPath(org, pr.repository, accounts)
  window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: 'ralph-dashboard' } }))
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('ralph:launch-pr-review', {
        detail: { prNumber: pr.id, repository: pr.repository, org, repoPath },
      })
    )
  }, 100)
}

function syncPRDetailIdentity({
  pr,
  prIdentityKey,
  approvalKey,
  previousPrIdentityKey,
  previousApprovalKey,
  setPreviousPrIdentityKey,
  setPreviousApprovalKey,
  setYouApproved,
  setHistoryUpdatedAt,
  setLinkedIssues,
  setBranches,
  setNudgeState,
  setNudgeError,
  branchFetchKeyRef,
}: {
  pr: PRDetailInfo
  prIdentityKey: string
  approvalKey: string
  previousPrIdentityKey: string
  previousApprovalKey: string
  setPreviousPrIdentityKey: (value: string) => void
  setPreviousApprovalKey: (value: string) => void
  setYouApproved: (value: boolean) => void
  setHistoryUpdatedAt: (value: string | null) => void
  setLinkedIssues: (value: PRLinkedIssue[]) => void
  setBranches: (value: { headBranch: string; baseBranch: string } | null) => void
  setNudgeState: (value: 'idle' | 'sending' | 'sent' | 'error') => void
  setNudgeError: (value: string | null) => void
  branchFetchKeyRef: { current: string }
}): void {
  if (previousPrIdentityKey !== prIdentityKey) {
    branchFetchKeyRef.current = prIdentityKey
    setPreviousPrIdentityKey(prIdentityKey)
    setPreviousApprovalKey(approvalKey)
    setYouApproved(pr.iApproved)
    setHistoryUpdatedAt(null)
    setLinkedIssues([])
    setBranches(initialBranches(pr))
    setNudgeState('idle')
    setNudgeError(null)
    return
  }
  if (previousApprovalKey !== approvalKey) {
    setPreviousApprovalKey(approvalKey)
    setYouApproved(pr.iApproved)
  }
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
    initialBranches(pr)
  )
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState<string | null>(null)
  const [youApproved, setYouApproved] = useState(pr.iApproved)
  const [isApproving, setIsApproving] = useState(false)
  const [linkedIssues, setLinkedIssues] = useState<PRLinkedIssue[]>([])
  const [nudgeState, setNudgeState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [nudgeError, setNudgeError] = useState<string | null>(null)
  const prIdentityKey = `${pr.id}:${pr.repository}:${pr.url}`
  const branchFetchKeyRef = useRef(prIdentityKey)
  const approvalKey = `${prIdentityKey}:${pr.iApproved}`
  const [previousPrIdentityKey, setPreviousPrIdentityKey] = useState(prIdentityKey)
  const [previousApprovalKey, setPreviousApprovalKey] = useState(approvalKey)

  syncPRDetailIdentity({
    pr,
    prIdentityKey,
    approvalKey,
    previousPrIdentityKey,
    previousApprovalKey,
    setPreviousPrIdentityKey,
    setPreviousApprovalKey,
    setYouApproved,
    setHistoryUpdatedAt,
    setLinkedIssues,
    setBranches,
    setNudgeState,
    setNudgeError,
    branchFetchKeyRef,
  })

  useEffect(() => {
    enqueueRef.current = enqueue
  }, [enqueue])

  const fetchBranches = useCallback(async () => {
    branchFetchKeyRef.current = prIdentityKey
    const knownBranches = getKnownBranches(pr.headBranch, pr.baseBranch)
    if (knownBranches) {
      setBranches(knownBranches)
      return
    }

    if (!ownerRepo) {
      setBranches(null)
      return
    }

    try {
      const result = await fetchPRBranchesFromGitHub({
        enqueue: enqueueRef.current,
        accounts,
        ownerRepo,
        prId: pr.id,
        repository: pr.repository,
      })
      if (branchFetchKeyRef.current === prIdentityKey) {
        setBranches(result)
      }
    } catch (_error: unknown) {
      if (branchFetchKeyRef.current === prIdentityKey) {
        setBranches(null)
      }
    }
  }, [accounts, ownerRepo, prIdentityKey, pr.id, pr.repository, pr.headBranch, pr.baseBranch])

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
    if (isNudgeBusy(nudgeState)) return
    setNudgeState('sending')
    setNudgeError(null)
    try {
      const result = await window.slack.nudgeAuthor({
        githubLogin: pr.author,
        prTitle: pr.title,
        prUrl: pr.url,
      })
      applyNudgeResult(result, setNudgeState, setNudgeError)
    } catch (err: unknown) {
      console.error('[Nudge] Error:', err)
      setNudgeFailure(String(err), setNudgeState, setNudgeError)
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
        aiReviewProviders={aiReviewProviders}
        onStartRalphReview={() => startRalphPRReview(pr, ownerRepo, accounts)}
      />

      <div className="pr-detail-body">
        <PRDetailBanners
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
          author={pr.author}
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
