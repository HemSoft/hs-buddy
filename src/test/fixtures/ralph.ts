import type { RalphRunInfo } from '../../types/ralph'

const FIXED_RUN_STARTED_AT = 1_000_000
const FIXED_RUN_UPDATED_AT = 1_060_000

export function makeRun(overrides: Partial<RalphRunInfo> = {}): RalphRunInfo {
  const baseRun = {
    runId: 'run-1',
    config: { repoPath: '/test', scriptType: 'ralph' },
    status: 'running',
    phase: 'iterating',
    pid: 100,
    currentIteration: 1,
    totalIterations: 3,
    startedAt: FIXED_RUN_STARTED_AT,
    updatedAt: FIXED_RUN_UPDATED_AT,
    completedAt: null,
    exitCode: null,
    error: null,
    logBuffer: [],
    stats: {
      checks: 0,
      agentTurns: 0,
      reviews: 0,
      copilotPRs: 0,
      issuesCreated: 0,
      scanIterations: 0,
      totalCost: null,
      totalPremium: 0,
    },
  } satisfies RalphRunInfo

  return Object.assign({}, baseRun, overrides)
}
