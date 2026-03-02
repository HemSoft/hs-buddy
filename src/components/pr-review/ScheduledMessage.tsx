import { Sparkles, Clock, X } from 'lucide-react'

interface ScheduledMessageProps {
  prTitle: string
  scheduleDelay: number
  onClose?: () => void
}

export function ScheduledMessage({ prTitle, scheduleDelay, onClose }: ScheduledMessageProps) {
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
          Review for <strong>{prTitle}</strong> has been scheduled to run in{' '}
          <strong>{scheduleDelay} minute{scheduleDelay !== 1 ? 's' : ''}</strong>.
        </p>
        <p className="pr-review-scheduled-hint">
          The result will appear in the Copilot results list when complete.
        </p>
      </div>
    </div>
  )
}
