import { useReducer, useCallback, useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { AppErrorBoundary } from '../AppErrorBoundary'
import { useRalphLoops } from '../../hooks/useRalphLoops'
import { RalphLaunchForm } from './RalphLaunchForm'
import type { RalphRunInfo, RalphTemplateInfo } from '../../types/ralph'
import {
  RalphDashboardAvailableScripts,
  RalphDashboardErrorBanner,
  RalphDashboardHeader,
  RalphDashboardRunSection,
} from './RalphDashboardSections'
import './RalphDashboard.css'

type ViewMode = 'grid' | 'launch'

interface PRLaunchData {
  prNumber: number
  repository: string
  org: string
  repoPath: string
}

interface IssueLaunchData {
  issueNumber: number
  issueTitle: string
  issueBody: string
  repository: string
  org: string
  repoPath: string
}

interface DashboardState {
  viewMode: ViewMode
  error: string | null
  selectedScript: string | null
  prLaunchData: PRLaunchData | null
  issueLaunchData: IssueLaunchData | null
}

type DashboardAction =
  | {
      type: 'setView'
      mode: ViewMode
      script?: string
      prLaunchData?: PRLaunchData
      issueLaunchData?: IssueLaunchData
    }
  | { type: 'setError'; error: string | null }

function setDashboardView(
  state: DashboardState,
  action: Extract<DashboardAction, { type: 'setView' }>
): DashboardState {
  return {
    ...state,
    viewMode: action.mode,
    selectedScript: action.script ?? null,
    prLaunchData: action.prLaunchData ?? null,
    issueLaunchData: action.issueLaunchData ?? null,
  }
}

function reducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'setView':
      return setDashboardView(state, action)
    case 'setError':
      return { ...state, error: action.error }
  }
}

function partitionRuns(runs: RalphRunInfo[]): {
  active: RalphRunInfo[]
  recent: RalphRunInfo[]
} {
  const active: RalphRunInfo[] = []
  const recent: RalphRunInfo[] = []
  for (const run of runs) {
    if (run.status === 'running' || run.status === 'pending') {
      active.push(run)
    } else {
      recent.push(run)
    }
  }
  return { active, recent }
}

function buildResetKey(renderErrorResetKey: number, state: DashboardState): string {
  const prKey = state.prLaunchData
    ? `${state.prLaunchData.org}/${state.prLaunchData.repository}#${state.prLaunchData.prNumber}`
    : ''
  const issueKey = state.issueLaunchData
    ? `${state.issueLaunchData.org}/${state.issueLaunchData.repository}#${state.issueLaunchData.issueNumber}`
    : ''
  return [renderErrorResetKey, state.viewMode, state.selectedScript ?? '', prKey, issueKey].join(
    '|'
  )
}

interface RalphDashboardProps {
  onOpenTab?: (viewId: string) => void
}

export function RalphDashboard({ onOpenTab }: RalphDashboardProps) {
  const { runs, loading, error: hookError, clearError, launch, stop, refresh } = useRalphLoops()
  const [state, dispatch] = useReducer(reducer, {
    viewMode: 'grid',
    error: null,
    selectedScript: null,
    prLaunchData: null,
    issueLaunchData: null,
  })
  const [templates, setTemplates] = useState<RalphTemplateInfo[]>([])
  const [renderErrorResetKey, setRenderErrorResetKey] = useState(0)

  useEffect(() => {
    window.ralph
      .listTemplates()
      .then(result => {
        if (Array.isArray(result)) setTemplates(result)
      })
      .catch(() => {})
  }, [])

  // Listen for sidebar script selection events
  useEffect(() => {
    const handler = (e: Event) => {
      const script = (e as CustomEvent<string>).detail
      dispatch({ type: 'setView', mode: 'launch', script })
    }
    window.addEventListener('ralph:select-script', handler)
    return () => {
      window.removeEventListener('ralph:select-script', handler)
    }
  }, [])

  // Listen for PR detail "Start Ralph Review" action
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<PRLaunchData>).detail
      dispatch({ type: 'setView', mode: 'launch', script: 'ralph-pr', prLaunchData: data })
    }
    window.addEventListener('ralph:launch-pr-review', handler)
    return () => {
      window.removeEventListener('ralph:launch-pr-review', handler)
    }
  }, [])

  // Listen for Issue detail "Start Ralph Loop" action
  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<IssueLaunchData>).detail
      dispatch({ type: 'setView', mode: 'launch', script: 'ralph', issueLaunchData: data })
    }
    window.addEventListener('ralph:launch-from-issue', handler)
    return () => {
      window.removeEventListener('ralph:launch-from-issue', handler)
    }
  }, [])

  const handleStop = useCallback(
    async (runId: string) => {
      const result = await stop(runId)
      if (!result.success) {
        dispatch({ type: 'setError', error: result.error ?? 'Stop failed' })
      }
    },
    [stop]
  )

  const handleLaunched = useCallback(
    (runId?: string) => {
      dispatch({ type: 'setView', mode: 'grid' })
      if (runId && onOpenTab) onOpenTab(`ralph-run:${runId}`)
    },
    [onOpenTab]
  )

  const handleClearError = useCallback(() => {
    dispatch({ type: 'setError', error: null })
    clearError()
    setRenderErrorResetKey(current => current + 1)
  }, [clearError])

  const handleLaunch = useCallback(
    async (config: Parameters<typeof launch>[0]) => {
      const result = await launch(config)
      if (result.success) {
        handleLaunched(result.runId)
      }
      return result
    },
    [handleLaunched, launch]
  )

  const handleSelectScript = useCallback((script: string) => {
    dispatch({ type: 'setView', mode: 'launch', script })
  }, [])

  const handleToggleLaunchView = useCallback(() => {
    dispatch({
      type: 'setView',
      mode: state.viewMode === 'launch' ? 'grid' : 'launch',
    })
  }, [state.viewMode])

  const { active, recent } = partitionRuns(runs)
  const displayError = state.error ?? hookError
  const isLaunchView = state.viewMode === 'launch'
  const dashboardBodyResetKey = buildResetKey(renderErrorResetKey, state)

  if (loading) {
    return (
      <div className="ralph-dashboard ralph-loading">
        <RefreshCw size={20} className="ralph-spin" />
        <span>Loading loops…</span>
      </div>
    )
  }

  return (
    <div className="ralph-dashboard">
      <RalphDashboardHeader
        isLaunchView={isLaunchView}
        onRefresh={refresh}
        onToggleLaunchView={handleToggleLaunchView}
      />

      <div className="ralph-dashboard-body">
        <RalphDashboardErrorBanner error={displayError} onDismiss={handleClearError} />

        <AppErrorBoundary
          fallback={({ message, reset }) => (
            <RalphDashboardErrorBanner
              error={message}
              onDismiss={() => {
                reset()
                handleClearError()
              }}
            />
          )}
          resetKey={dashboardBodyResetKey}
        >
          <>
            {isLaunchView && (
              <RalphLaunchForm
                initialScript={state.selectedScript}
                initialPR={state.prLaunchData}
                initialIssue={state.issueLaunchData}
                onLaunch={handleLaunch}
              />
            )}

            <RalphDashboardAvailableScripts
              templates={templates}
              onLaunchScript={handleSelectScript}
            />
            <RalphDashboardRunSection title="Active" runs={active} onStop={handleStop} />
            <RalphDashboardRunSection title="Recent" runs={recent} onStop={handleStop} />
          </>
        </AppErrorBoundary>
      </div>
    </div>
  )
}
