import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Sparkles,
  Play,
  Clock,
  ExternalLink,
  GitPullRequest,
  User,
  Cpu,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useCopilotSettings, useGitHubAccounts } from '../hooks/useConfig'
import { useBuddyStatsMutations } from '../hooks/useConvex'
import { AccountPicker } from './shared/AccountPicker'
import { ModelPicker } from './shared/ModelPicker'
import { PremiumUsageBadge } from './shared/PremiumUsageBadge'
import './PRReviewPanel.css'

/** Metadata shape passed from PullRequestList / RepoPRList */
export interface PRReviewInfo {
  prUrl: string
  prTitle: string
  prNumber: number
  repo: string
  org: string
  author: string
}

interface PRReviewPanelProps {
  /** PR metadata to review */
  prInfo: PRReviewInfo
  /** Called when the review is submitted (run now or scheduled) to navigate to the result */
  onSubmitted?: (resultId: string) => void
  /** Called to close / dismiss the panel */
  onClose?: () => void
}

const DEFAULT_PROMPT_TEMPLATE = (url: string) =>
  `Please do a thorough PR review on ${url}. Analyze the code changes for bugs, security issues, performance problems, and code quality. Categorize findings by severity: 🔴 Critical, 🟡 Medium, 🟢 Nitpick.`

export function PRReviewPanel({ prInfo, onSubmitted, onClose }: PRReviewPanelProps) {
  const { model: configuredModel, ghAccount: configuredAccount } = useCopilotSettings()
  const { accounts: githubAccounts } = useGitHubAccounts()
  const { increment: incrementStat } = useBuddyStatsMutations()

  // ── Local state ────────────────────────────────────────────────────────
  const [account, setAccount] = useState('')
  const [model, setModel] = useState(configuredModel || 'claude-sonnet-4.5')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT_TEMPLATE(prInfo.prUrl))
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState(false)
  const [scheduleDelay, setScheduleDelay] = useState(5) // minutes

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initializedRef = useRef(false)

  // ── Auto-resolve account from PR org ───────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // Try to match the PR's org to a configured GitHub account
    const matchedAccount = githubAccounts.find(
      a => a.org.toLowerCase() === prInfo.org.toLowerCase()
    )
    if (matchedAccount) {
      setAccount(matchedAccount.username)
    } else if (configuredAccount) {
      setAccount(configuredAccount)
    }

    if (configuredModel) {
      setModel(configuredModel)
    }
  }, [githubAccounts, prInfo.org, configuredAccount, configuredModel])

  // Auto-resize textarea when expanded
  useEffect(() => {
    if (promptExpanded && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`
    }
  }, [prompt, promptExpanded])

  // ── Run now ────────────────────────────────────────────────────────────
  const handleRunNow = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      incrementStat({ field: 'copilotPrReviews' }).catch(() => {})

      const result = await window.copilot.execute({
        prompt,
        category: 'pr-review',
        model,
        metadata: {
          prUrl: prInfo.prUrl,
          prTitle: prInfo.prTitle,
          prNumber: prInfo.prNumber,
          repo: prInfo.repo,
          org: prInfo.org,
          author: prInfo.author,
          ghAccount: account || undefined,
        },
      })

      if (result.success && result.resultId) {
        // Navigate to the result
        window.dispatchEvent(
          new CustomEvent('copilot:open-result', { detail: { resultId: result.resultId } })
        )
        onSubmitted?.(result.resultId)
      } else {
        setError(result.error ?? 'Failed to start PR review')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }, [prompt, model, account, prInfo, submitting, incrementStat, onSubmitted])

  // ── Schedule for later ─────────────────────────────────────────────────
  const handleSchedule = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      // For now, use a simple setTimeout-based delayed execution
      // In the future this could integrate with the automation/schedules system
      const delayMs = scheduleDelay * 60 * 1000

      setTimeout(async () => {
        try {
          incrementStat({ field: 'copilotPrReviews' }).catch(() => {})

          const result = await window.copilot.execute({
            prompt,
            category: 'pr-review',
            model,
            metadata: {
              prUrl: prInfo.prUrl,
              prTitle: prInfo.prTitle,
              prNumber: prInfo.prNumber,
              repo: prInfo.repo,
              org: prInfo.org,
              author: prInfo.author,
              ghAccount: account || undefined,
              scheduledAt: Date.now(),
            },
          })

          if (result.success && result.resultId) {
            window.dispatchEvent(
              new CustomEvent('copilot:open-result', { detail: { resultId: result.resultId } })
            )
          }
        } catch (err) {
          console.error('Scheduled PR review failed:', err)
        }
      }, delayMs)

      setScheduled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }, [prompt, model, account, prInfo, scheduleDelay, submitting, incrementStat])

  // ── Reset prompt to default ────────────────────────────────────────────
  const handleResetPrompt = useCallback(() => {
    setPrompt(DEFAULT_PROMPT_TEMPLATE(prInfo.prUrl))
  }, [prInfo.prUrl])

  // ── Render ─────────────────────────────────────────────────────────────

  if (scheduled) {
    return (
      <div className="pr-review-panel">
        <div className="pr-review-panel-header">
          <div className="pr-review-panel-title">
            <Sparkles size={18} />
            <h2>PR Review Scheduled</h2>
          </div>
          {onClose && (
            <button className="pr-review-close-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="pr-review-scheduled-message">
          <Clock size={32} />
          <p>
            Review for <strong>{prInfo.prTitle}</strong> has been scheduled to run in{' '}
            <strong>{scheduleDelay} minute{scheduleDelay !== 1 ? 's' : ''}</strong>.
          </p>
          <p className="pr-review-scheduled-hint">
            The result will appear in the Copilot results list when complete.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pr-review-panel">
      {/* Header */}
      <div className="pr-review-panel-header">
        <div className="pr-review-panel-title">
          <Sparkles size={18} />
          <h2>PR Review</h2>
        </div>
        {onClose && (
          <button className="pr-review-close-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        )}
      </div>

      {/* PR Info Card */}
      <div className="pr-review-pr-card">
        <div className="pr-review-pr-header">
          <GitPullRequest size={16} />
          <span className="pr-review-pr-title">{prInfo.prTitle}</span>
        </div>
        <div className="pr-review-pr-meta">
          <span className="pr-review-pr-repo">
            {prInfo.org}/{prInfo.repo}
          </span>
          <span className="pr-review-pr-number">#{prInfo.prNumber}</span>
          <span className="pr-review-pr-author">
            <User size={12} />
            {prInfo.author}
          </span>
          <a
            className="pr-review-pr-link"
            onClick={e => {
              e.preventDefault()
              window.shell?.openExternal(prInfo.prUrl)
            }}
            title="Open PR in browser"
          >
            <ExternalLink size={12} />
            View PR
          </a>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="pr-review-config">
        <div className="pr-review-config-row">
          <label className="pr-review-label">
            <User size={14} />
            Account
          </label>
          <div className="pr-review-control">
            <AccountPicker
              value={account}
              onChange={setAccount}
              disabled={submitting}
              title="GitHub account used for authentication"
              variant="select"
            />
            {account && <PremiumUsageBadge username={account} />}
          </div>
        </div>

        <div className="pr-review-config-row">
          <label className="pr-review-label">
            <Cpu size={14} />
            Model
          </label>
          <div className="pr-review-control">
            <ModelPicker
              value={model}
              onChange={setModel}
              ghAccount={account}
              disabled={submitting}
              title="AI model for the review"
              variant="select"
              showRefresh
            />
          </div>
        </div>
      </div>

      {/* Prompt Section */}
      <div className="pr-review-prompt-section">
        <div
          className="pr-review-prompt-header"
          onClick={() => setPromptExpanded(!promptExpanded)}
        >
          <div className="pr-review-prompt-label">
            <FileText size={14} />
            <span>Prompt</span>
          </div>
          <div className="pr-review-prompt-toggle">
            <span className="pr-review-prompt-hint">
              {promptExpanded ? 'Click to collapse' : 'Click to edit'}
            </span>
            {promptExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
        {promptExpanded ? (
          <div className="pr-review-prompt-editor">
            <textarea
              ref={textareaRef}
              className="pr-review-prompt-textarea"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={submitting}
              rows={6}
            />
            <div className="pr-review-prompt-actions">
              <button
                className="pr-review-btn-text"
                onClick={handleResetPrompt}
                disabled={submitting}
              >
                Reset to default
              </button>
              <span className="pr-review-char-count">{prompt.length} chars</span>
            </div>
          </div>
        ) : (
          <div
            className="pr-review-prompt-preview"
            onClick={() => setPromptExpanded(true)}
          >
            {prompt.length > 200 ? prompt.slice(0, 200) + '...' : prompt}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <div className="pr-review-error">{error}</div>}

      {/* Action Buttons */}
      <div className="pr-review-actions">
        <button
          className="pr-review-btn pr-review-btn-primary"
          onClick={handleRunNow}
          disabled={submitting || !prompt.trim()}
        >
          <Play size={14} />
          Run Now
        </button>

        <div className="pr-review-schedule-group">
          <button
            className="pr-review-btn pr-review-btn-secondary"
            onClick={handleSchedule}
            disabled={submitting || !prompt.trim()}
          >
            <Clock size={14} />
            Schedule
          </button>
          <div className="pr-review-schedule-delay">
            <span>in</span>
            <select
              className="pr-review-delay-select"
              value={scheduleDelay}
              onChange={e => setScheduleDelay(Number(e.target.value))}
              disabled={submitting}
            >
              <option value={1}>1 min</option>
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
