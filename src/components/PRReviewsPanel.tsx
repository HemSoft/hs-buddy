import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquareShare,
  RefreshCcw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { GitHubClient } from '../api/github'
import { useGitHubAccounts } from '../hooks/useConfig'
import type { PRDetailInfo } from '../utils/prDetailView'
import { usePRReviewRunsByPR } from '../hooks/useConvex'
import { parseOwnerRepoFromUrl } from '../utils/githubUrl'
import { formatDateCompact } from '../utils/dateUtils'
import { buildReReviewPrompt, dispatchPRReviewOpen } from '../utils/prReviewEvents'
import './PRReviewsPanel.css'

interface PRReviewsPanelProps {
  pr: PRDetailInfo
}

const STATUS_ICONS: Record<string, React.JSX.Element> = {
  completed: <CheckCircle2 size={14} className="pr-reviews-status completed" />,
  failed: <XCircle size={14} className="pr-reviews-status failed" />,
  running: <Loader2 size={14} className="spin pr-reviews-status running" />,
}

const PENDING_ICON = <Clock size={14} className="pr-reviews-status pending" />

function getLatestStatusIcon(latest: { status: string } | null) {
  if (!latest) return null
  return Object.hasOwn(STATUS_ICONS, latest.status) ? STATUS_ICONS[latest.status] : PENDING_ICON
}

function ReviewRunSha({ reviewedHeadSha }: { reviewedHeadSha?: string | null }) {
  if (!reviewedHeadSha) return null
  return <span className="pr-reviews-item-sha mono">{reviewedHeadSha.slice(0, 12)}</span>
}

function isReviewRunPublished(publishedRunIds: Set<string>, runId: string) {
  return publishedRunIds.has(runId)
}

function isReviewRunPublishing(publishingRunId: string | null, runId: string) {
  return publishingRunId === runId
}

function resolvePublishButtonTitle(isPublished: boolean) {
  return isPublished ? 'Published to PR' : 'Publish review as PR comment'
}

function resolvePublishButtonClassName(isPublished: boolean) {
  return `pr-reviews-icon-btn${isPublished ? ' published' : ''}`
}

function shouldDisablePublishButton(isPublished: boolean, publishingRunId: string | null) {
  return publishingRunId !== null || isPublished
}

function ReviewRunPublishButton({
  run,
  publishingRunId,
  publishedRunIds,
  onPublish,
}: {
  run: NonNullable<ReturnType<typeof usePRReviewRunsByPR>>[number]
  publishingRunId: string | null
  publishedRunIds: Set<string>
  onPublish: (runId: string, resultId: string, model?: string) => void
}) {
  if (run.status !== 'completed') return null

  const isPublished = isReviewRunPublished(publishedRunIds, run._id)
  const isPublishing = isReviewRunPublishing(publishingRunId, run._id)

  return (
    <button
      type="button"
      className={resolvePublishButtonClassName(isPublished)}
      onClick={() => onPublish(run._id, run.resultId, run.model)}
      disabled={shouldDisablePublishButton(isPublished, publishingRunId)}
      title={resolvePublishButtonTitle(isPublished)}
    >
      {isPublishing ? <Loader2 size={12} className="spin" /> : <MessageSquareShare size={12} />}
    </button>
  )
}

function ReviewRunItem({
  run,
  publishingRunId,
  publishedRunIds,
  onPublish,
  onOpenResult,
}: {
  run: NonNullable<ReturnType<typeof usePRReviewRunsByPR>>[number]
  publishingRunId: string | null
  publishedRunIds: Set<string>
  onPublish: (runId: string, resultId: string, model?: string) => void
  onOpenResult: (resultId: string) => void
}) {
  return (
    <div className="pr-reviews-item">
      <div className="pr-reviews-item-main">
        <span className={`pr-reviews-pill ${run.status}`}>{run.status}</span>
        <span className="pr-reviews-item-time">{formatDateCompact(run.createdAt)}</span>
        <ReviewRunSha reviewedHeadSha={run.reviewedHeadSha} />
      </div>
      <div className="pr-reviews-item-actions">
        <ReviewRunPublishButton
          run={run}
          publishingRunId={publishingRunId}
          publishedRunIds={publishedRunIds}
          onPublish={onPublish}
        />
        <button
          type="button"
          className="pr-reviews-icon-btn"
          onClick={() => onOpenResult(run.resultId)}
          title="Open review result"
        >
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}

function buildReviewCommentBody(resultText: string, model?: string, resultModel?: string): string {
  const modelName = model || resultModel || 'AI'
  return `## \u{1F916} AI Review\n\n${resultText}\n\n---\n*Published from HS Buddy \u2014 ${modelName} review*`
}

function resolvePublishTarget(owner: string | undefined, repo: string | undefined) {
  if (!owner || !repo) return null
  return { owner, repo }
}

async function loadReviewResultData(
  convex: ReturnType<typeof useConvex>,
  resultId: string
): Promise<{ resultText: string; resultModel?: string } | null> {
  const result = await convex.query(api.copilotResults.get, {
    id: resultId as Id<'copilotResults'>,
  })

  if (typeof result?.result !== 'string') return null

  return {
    resultText: result.result,
    resultModel: typeof result.model === 'string' ? result.model : undefined,
  }
}

function usePublishToPR(pr: PRDetailInfo) {
  const parsed = parseOwnerRepoFromUrl(pr.url)
  const owner = pr.org || parsed?.owner
  const repo = pr.repository || parsed?.repo
  const convex = useConvex()
  const { accounts } = useGitHubAccounts()
  const [publishingRunId, setPublishingRunId] = useState<string | null>(null)
  const [publishedRunIds, setPublishedRunIds] = useState<Set<string>>(new Set())

  const handlePublishToPR = async (runId: string, resultId: string, model?: string) => {
    /* v8 ignore start -- button is disabled when publishingRunId is set */
    if (publishingRunId) return
    /* v8 ignore stop */

    const target = resolvePublishTarget(owner, repo)
    if (!target) return

    setPublishingRunId(runId)
    try {
      const resultData = await loadReviewResultData(convex, resultId)
      if (!resultData) return
      const client = new GitHubClient({ accounts }, 7)
      const body = buildReviewCommentBody(resultData.resultText, model, resultData.resultModel)
      await client.addPRComment(target.owner, target.repo, pr.id, body)
      setPublishedRunIds(prev => new Set(prev).add(runId))
    } catch (err: unknown) {
      console.error('Failed to publish review to PR:', err)
    } finally {
      setPublishingRunId(null)
    }
  }

  return { owner, repo, publishingRunId, publishedRunIds, handlePublishToPR }
}

function resolveLatestReviewRun(runs: ReturnType<typeof usePRReviewRunsByPR>) {
  if (!runs || runs.length === 0) return null
  return runs[0]
}

function hasReviewRuns(runs: ReturnType<typeof usePRReviewRunsByPR>) {
  return Array.isArray(runs) && runs.length > 0
}

function resolveLatestReviewedSha(latest: { reviewedHeadSha?: string | null } | null) {
  return latest?.reviewedHeadSha
}

function resolveReReviewOrg(pr: PRDetailInfo, owner: string | undefined) {
  return pr.org || owner || ''
}

function PRReviewsLoadingState() {
  return (
    <div className="pr-reviews-panel">
      <div className="pr-reviews-loading">
        <Loader2 size={20} className="spin" />
        <p>Loading AI reviews…</p>
      </div>
    </div>
  )
}

function LatestReviewSummary({
  latest,
  latestStatusIcon,
}: {
  latest: NonNullable<ReturnType<typeof resolveLatestReviewRun>>
  latestStatusIcon: React.JSX.Element | null
}) {
  return (
    <div className="pr-reviews-latest">
      <div className="pr-reviews-latest-row">
        <span className="pr-reviews-label">Latest</span>
        <span className="pr-reviews-value">
          {latestStatusIcon}
          {latest.status}
        </span>
      </div>
      <div className="pr-reviews-latest-row">
        <span className="pr-reviews-label">Reviewed SHA</span>
        <span className="pr-reviews-value mono">
          {latest.reviewedHeadSha ? latest.reviewedHeadSha.slice(0, 12) : 'unknown'}
        </span>
      </div>
      <div className="pr-reviews-latest-row">
        <span className="pr-reviews-label">Run time</span>
        <span className="pr-reviews-value">{formatDateCompact(latest.createdAt)}</span>
      </div>
    </div>
  )
}

function PRReviewsContent({
  hasRuns,
  runs,
  handleReReview,
  publishingRunId,
  publishedRunIds,
  handlePublishToPR,
  handleOpenResult,
}: {
  hasRuns: boolean
  runs: NonNullable<ReturnType<typeof usePRReviewRunsByPR>>
  handleReReview: () => void
  publishingRunId: string | null
  publishedRunIds: Set<string>
  handlePublishToPR: (runId: string, resultId: string, model?: string) => void
  handleOpenResult: (resultId: string) => void
}) {
  if (!hasRuns) {
    return (
      <div className="pr-reviews-empty">
        <p>No AI reviews recorded for this PR yet.</p>
        <button type="button" className="pr-reviews-primary-btn" onClick={handleReReview}>
          <Sparkles size={14} />
          Start first review
        </button>
      </div>
    )
  }

  return (
    <div className="pr-reviews-list">
      {runs.map(run => (
        <ReviewRunItem
          key={run._id}
          run={run}
          publishingRunId={publishingRunId}
          publishedRunIds={publishedRunIds}
          onPublish={handlePublishToPR}
          onOpenResult={handleOpenResult}
        />
      ))}
    </div>
  )
}

export function PRReviewsPanel({ pr }: PRReviewsPanelProps) {
  const { owner, repo, publishingRunId, publishedRunIds, handlePublishToPR } = usePublishToPR(pr)
  const runs = usePRReviewRunsByPR(owner, repo, pr.id, 25)
  const hasRuns = hasReviewRuns(runs)
  const latest = resolveLatestReviewRun(runs)
  const latestStatusIcon = useMemo(() => getLatestStatusIcon(latest), [latest])

  const handleOpenResult = (resultId: string) => {
    window.dispatchEvent(new CustomEvent('copilot:open-result', { detail: { resultId } }))
  }

  const handleReReview = () => {
    const prompt = buildReReviewPrompt(pr.url, resolveLatestReviewedSha(latest))

    dispatchPRReviewOpen({
      prUrl: pr.url,
      prTitle: pr.title,
      prNumber: pr.id,
      repo: pr.repository,
      org: resolveReReviewOrg(pr, owner),
      author: pr.author,
      initialPrompt: prompt,
    })
  }

  if (runs === undefined) {
    return <PRReviewsLoadingState />
  }

  return (
    <div className="pr-reviews-panel">
      <div className="pr-reviews-header">
        <div className="pr-reviews-title">
          <Sparkles size={16} />
          <h3>AI Reviews</h3>
        </div>
        <button type="button" className="pr-reviews-rereview-btn" onClick={handleReReview}>
          <RefreshCcw size={13} />
          Re-review
        </button>
      </div>

      {latest && <LatestReviewSummary latest={latest} latestStatusIcon={latestStatusIcon} />}

      <PRReviewsContent
        hasRuns={hasRuns}
        runs={runs}
        handleReReview={handleReReview}
        publishingRunId={publishingRunId}
        publishedRunIds={publishedRunIds}
        handlePublishToPR={handlePublishToPR}
        handleOpenResult={handleOpenResult}
      />
    </div>
  )
}
