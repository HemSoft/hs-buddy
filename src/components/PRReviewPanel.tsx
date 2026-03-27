import { Sparkles, Play, Clock, User, Cpu, X } from 'lucide-react'
import { AccountPicker } from './shared/AccountPicker'
import { ModelPicker } from './shared/ModelPicker'
import { PremiumUsageBadge } from './shared/PremiumUsageBadge'
import { PRInfoCard } from './pr-review/PRInfoCard'
import { PromptSection } from './pr-review/PromptSection'
import type { PRReviewInfo } from './pr-review/PRReviewInfo'
import { ScheduledMessage } from './pr-review/ScheduledMessage'
import { usePRReviewData } from './pr-review/usePRReviewData'
import './PRReviewPanel.css'

interface PRReviewPanelProps {
  /** PR metadata to review */
  prInfo: PRReviewInfo
  /** Called when the review is submitted (run now or scheduled) to navigate to the result */
  onSubmitted?: (resultId: string) => void
  /** Called to close / dismiss the panel */
  onClose?: () => void
}

export function PRReviewPanel({ prInfo, onSubmitted, onClose }: PRReviewPanelProps) {
  const {
    account,
    setAccount,
    model,
    setModel,
    prompt,
    setPrompt,
    promptExpanded,
    setPromptExpanded,
    submitting,
    error,
    scheduled,
    scheduleDelay,
    setScheduleDelay,
    savingDefault,
    handleRunNow,
    handleSchedule,
    handleResetPrompt,
    handleSaveAsDefault,
  } = usePRReviewData(prInfo, onSubmitted)

  if (scheduled) {
    return (
      <ScheduledMessage prTitle={prInfo.prTitle} scheduleDelay={scheduleDelay} onClose={onClose} />
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

      <PRInfoCard
        prTitle={prInfo.prTitle}
        org={prInfo.org}
        repo={prInfo.repo}
        prNumber={prInfo.prNumber}
        author={prInfo.author}
        prUrl={prInfo.prUrl}
      />

      {/* Configuration Section */}
      <div className="pr-review-config">
        <div className="pr-review-config-row">
          <label htmlFor="pr-review-account" className="pr-review-label">
            <User size={14} />
            Account
          </label>
          <div className="pr-review-control">
            <AccountPicker
              id="pr-review-account"
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
          <label htmlFor="pr-review-model" className="pr-review-label">
            <Cpu size={14} />
            Model
          </label>
          <div className="pr-review-control">
            <ModelPicker
              id="pr-review-model"
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

      <PromptSection
        prompt={prompt}
        promptExpanded={promptExpanded}
        submitting={submitting}
        savingDefault={savingDefault}
        onPromptChange={setPrompt}
        onToggleExpanded={() => setPromptExpanded(prev => !prev)}
        onResetPrompt={handleResetPrompt}
        onSaveAsDefault={handleSaveAsDefault}
      />

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
