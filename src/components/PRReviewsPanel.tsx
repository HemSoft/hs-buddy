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

function getLatestStatusIcon(latest: { status: string } | null) {
  if (!latest) return null
  if (latest.status === 'completed')
    return <CheckCircle2 size={14} className="pr-reviews-status completed" />
  if (latest.status === 'failed') return <XCircle size={14} className="pr-reviews-status failed" />
  if (latest.status === 'running')
    return <Loader2 size={14} className="spin pr-reviews-status running" />
  return <Clock size={14} className="pr-reviews-status pending" />
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
        {run.reviewedHeadSha && (
          <span className="pr-reviews-item-sha mono">{run.reviewedHeadSha.slice(0, 12)}</span>
        )}
      </div>
      <div className="pr-reviews-item-actions">
        {run.status === 'completed' && (
          <button
            className={`pr-reviews-icon-btn${publishedRunIds.has(run._id) ? ' published' : ''}`}
            onClick={() => onPublish(run._id, run.resultId, run.model)}
            disabled={!!publishingRunId || publishedRunIds.has(run._id)}
            title={
              publishedRunIds.has(run._id) ? 'Published to PR' : 'Publish review as PR comment'
            }
          >
            {publishingRunId === run._id ? (
              <Loader2 size={12} className="spin" />
            ) : (
              <MessageSquareShare size={12} />
            )}
          </button>
        )}
        <button
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
    if (!owner || !repo) return
    setPublishingRunId(runId)
    try {
      const result = await convex.query(api.copilotResults.get, {
        id: resultId as Id<'copilotResults'>,
      })
      if (!result?.result) return
      const client = new GitHubClient({ accounts }, 7)
      const body = buildReviewCommentBody(result.result, model, result.model)
      await client.addPRComment(owner, repo, pr.id, body)
      setPublishedRunIds(prev => new Set(prev).add(runId))
    } catch (err) {
      console.error('Failed to publish review to PR:', err)
    } finally {
      setPublishingRunId(null)
    }
  }

  return { owner, repo, publishingRunId, publishedRunIds, handlePublishToPR }
}

export function PRReviewsPanel({ pr }: PRReviewsPanelProps) {
  const { owner, repo, publishingRunId, publishedRunIds, handlePublishToPR } = usePublishToPR(pr)

  const runs = usePRReviewRunsByPR(owner, repo, pr.id, 25)

  const hasRuns = !!runs && runs.length > 0
  const latest = hasRuns ? runs[0] : null

  const latestStatusIcon = useMemo(() => getLatestStatusIcon(latest), [latest])

  const handleOpenResult = (resultId: string) => {
    window.dispatchEvent(new CustomEvent('copilot:open-result', { detail: { resultId } }))
  }

  const handleReReview = () => {
    const prompt = buildReReviewPrompt(pr.url, latest?.reviewedHeadSha)

    dispatchPRReviewOpen({
      prUrl: pr.url,
      prTitle: pr.title,
      prNumber: pr.id,
      repo: pr.repository,
      org: pr.org || owner || '',
      author: pr.author,
      initialPrompt: prompt,
    })
  }

  if (runs === undefined) {
    return (
      <div className="pr-reviews-panel">
        <div className="pr-reviews-loading">
          <Loader2 size={20} className="spin" />
          <p>Loading AI reviews…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pr-reviews-panel">
      <div className="pr-reviews-header">
        <div className="pr-reviews-title">
          <Sparkles size={16} />
          <h3>AI Reviews</h3>
        </div>
        <button className="pr-reviews-rereview-btn" onClick={handleReReview}>
          <RefreshCcw size={13} />
          Re-review
        </button>
      </div>

      {latest && (
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
      )}

      {!hasRuns ? (
        <div className="pr-reviews-empty">
          <p>No AI reviews recorded for this PR yet.</p>
          <button className="pr-reviews-primary-btn" onClick={handleReReview}>
            <Sparkles size={14} />
            Start first review
          </button>
        </div>
      ) : (
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
      )}
    </div>
  )
}
