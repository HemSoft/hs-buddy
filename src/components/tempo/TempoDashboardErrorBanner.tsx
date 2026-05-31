interface TempoDashboardErrorBannerProps {
  error: string
  canRetry: boolean
  onRetry: () => void
  onDismiss: () => void
}

export function TempoDashboardErrorBanner({
  error,
  canRetry,
  onRetry,
  onDismiss,
}: TempoDashboardErrorBannerProps) {
  return (
    <div className="tempo-error">
      <span>⚠ {error}</span>
      {canRetry ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}
