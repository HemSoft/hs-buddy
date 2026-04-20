/** Base loading phase used by most async state reducers. */
export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error'

/** Extended phase that adds 'refreshing' for components that refetch while showing stale data. */
export type RefreshableLoadPhase = LoadPhase | 'refreshing'
