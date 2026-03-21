import { dataCache } from '../services/dataCache'
import type { UserActivitySummary } from '../api/github'

export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface ActivityState {
  activity: UserActivitySummary | null
  phase: LoadPhase
  error: string | null
}

export type ActivityAction =
  | { type: 'RESET_FROM_CACHE'; payload: UserActivitySummary }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: UserActivitySummary }
  | { type: 'FETCH_ERROR'; payload: string }

export function createInitialActivityState(cacheKey: string): ActivityState {
  const cached = dataCache.get<UserActivitySummary>(cacheKey)
  if (cached?.data) {
    return {
      activity: cached.data,
      phase: 'ready',
      error: null,
    }
  }

  return {
    activity: null,
    phase: 'idle',
    error: null,
  }
}

export function activityReducer(state: ActivityState, action: ActivityAction): ActivityState {
  switch (action.type) {
    case 'RESET_FROM_CACHE':
      return {
        activity: action.payload,
        phase: 'ready',
        error: null,
      }
    case 'FETCH_START':
      return {
        activity: null,
        phase: 'loading',
        error: null,
      }
    case 'FETCH_SUCCESS':
      return {
        activity: action.payload,
        phase: 'ready',
        error: null,
      }
    case 'FETCH_ERROR':
      return {
        ...state,
        phase: 'error',
        error: action.payload,
      }
  }
}
