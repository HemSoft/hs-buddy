import { PanelErrorState, PanelLoadingState } from '../shared/PanelStates'

export function BookmarkLoadState({
  timedOut,
  onRetry,
}: {
  timedOut: boolean
  onRetry: () => void
}) {
  if (!timedOut) return <PanelLoadingState message="Loading bookmarks…" />

  return (
    <PanelErrorState
      title="Unable to load bookmarks"
      error="Buddy could not reach its bookmark service. Check the Convex connection, then try again."
      onRetry={onRetry}
    />
  )
}
