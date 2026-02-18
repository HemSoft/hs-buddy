import { useMemo } from 'react'
import { CheckCircle2, Clock, ExternalLink, Loader2, RefreshCcw, Sparkles, XCircle } from 'lucide-react'
import type { PRDetailInfo } from '../utils/prDetailView'
import { usePRReviewRunsByPR } from '../hooks/useConvex'
import './PRReviewsPanel.css'

interface PRReviewsPanelProps {
  pr: PRDetailInfo
}

function parseOwnerRepoFromUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match || !match[1] || !match[2]) return null
  return { owner: match[1], repo: match[2] }
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function PRReviewsPanel({ pr }: PRReviewsPanelProps) {
  const parsed = parseOwnerRepoFromUrl(pr.url)
  const owner = pr.org || parsed?.owner
  const repo = pr.repository || parsed?.repo

  const runs = usePRReviewRunsByPR(owner, repo, pr.id, 25)

  const hasRuns = !!runs && runs.length > 0
  const latest = hasRuns ? runs[0] : null

  const latestStatusIcon = useMemo(() => {
    if (!latest) return null
    if (latest.status === 'completed') return <CheckCircle2 size={14} className="pr-reviews-status completed" />
    if (latest.status === 'failed') return <XCircle size={14} className="pr-reviews-status failed" />
    if (latest.status === 'running') return <Loader2 size={14} className="spin pr-reviews-status running" />
    return <Clock size={14} className="pr-reviews-status pending" />
  }, [latest])

  const handleOpenResult = (resultId: string) => {
    window.dispatchEvent(new CustomEvent('copilot:open-result', { detail: { resultId } }))
  }

  const handleReReview = () => {
    const prompt = latest?.reviewedHeadSha
      ? `Please re-review ${pr.url}. Focus only on changes introduced after commit ${latest.reviewedHeadSha}. Prioritize unresolved or outdated review conversations and verify whether prior findings are addressed.`
      : `Please do a targeted re-review on ${pr.url}. Focus on newly pushed commits and unresolved review conversations.`

    window.dispatchEvent(
      new CustomEvent('pr-review:open', {
        detail: {
          prUrl: pr.url,
          prTitle: pr.title,
          prNumber: pr.id,
          repo: pr.repository,
          org: pr.org || owner || '',
          author: pr.author,
          initialPrompt: prompt,
        },
      })
    )
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
            <span className="pr-reviews-value">{formatDate(latest.createdAt)}</span>
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
            <div key={run._id} className="pr-reviews-item">
              <div className="pr-reviews-item-main">
                <span className={`pr-reviews-pill ${run.status}`}>{run.status}</span>
                <span className="pr-reviews-item-time">{formatDate(run.createdAt)}</span>
                {run.reviewedHeadSha && (
                  <span className="pr-reviews-item-sha mono">{run.reviewedHeadSha.slice(0, 12)}</span>
                )}
              </div>
              <div className="pr-reviews-item-actions">
                <button
                  className="pr-reviews-icon-btn"
                  onClick={() => handleOpenResult(run.resultId)}
                  title="Open review result"
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
