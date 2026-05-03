// Ralph Loops domain types — config, launch parameters, run state

// ── Status & Phase ──────────────────────────────────────────────

export type RalphRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'orphaned'

export type RalphRunPhase =
  | 'initializing'
  | 'iterating'
  | 'scanning'
  | 'pr-handoff'
  | 'pr-resolving'
  | 'completed'
  | 'failed'

export type RalphProvider = 'copilot' | 'opencode' | 'copilot-go' | 'openrouter'
type RalphAgentCategory = 'dev' | 'review'

// ── Config types (mirror scripts/ralph-loops/config/*.json) ─────

interface RalphModelEntry {
  label: string
  costMultiplier: number
  provider: string
  reasoningEffort: string
}

export interface RalphModelsConfig {
  $comment?: string
  version: string
  models: Record<string, RalphModelEntry>
  aliases: Record<string, string>
  tiers: Record<string, { model: string; description: string }>
  default: string
}

interface RalphAgentRole {
  category: RalphAgentCategory
  description: string
  agent: Partial<Record<RalphProvider, string>>
  tier: string
  skills: string[]
}

export interface RalphAgentsConfig {
  $comment?: string
  version: string
  defaults: { devAgent: string }
  roles: Record<string, RalphAgentRole>
}

interface RalphByokConfig {
  baseUrl: string
  providerType: string
  authFile?: string
  authKey?: string
  authEnvVar?: string
}

export interface RalphProviderEntry {
  command: string
  subcommand?: string
  description: string
  promptStyle: 'flag' | 'positional'
  defaultModel?: string
  $modelNote?: string
  flags: Record<string, string>
  modelTemplate: string
  supportsNativePrReview: boolean
  nativePrReviewerLogin?: string
  supportedModelProviders?: string[]
  byok?: RalphByokConfig
}

export interface RalphProvidersConfig {
  $comment?: string
  version: string
  providers: Record<string, RalphProviderEntry>
  default: string
}

export type RalphConfigType = 'models' | 'agents' | 'providers'
export type RalphConfigMap = {
  models: RalphModelsConfig
  agents: RalphAgentsConfig
  providers: RalphProvidersConfig
}

// ── Launch parameters ───────────────────────────────────────────

export interface RalphLaunchConfig {
  repoPath: string
  scriptType: 'ralph' | 'ralph-pr' | 'ralph-issues' | 'template'
  templateScript?: string // e.g. "ralph-improve-test-coverage.ps1"
  model?: string
  provider?: RalphProvider
  devAgent?: string // dev agent role (e.g. "anvil")
  agents?: string[] // review role or role@model specs
  iterations?: number // -Max: work iterations on same branch before PR
  repeats?: number // -Times: full work→PR cycles (uses ralph-repeat.ps1)
  workUntil?: string // HH:mm
  branch?: string
  prompt?: string
  prNumber?: number // PR number for ralph-pr standalone runs
  issueNumber?: number // GitHub issue number to work on (used as prompt source)
  noAudio?: boolean
  skipReview?: boolean
  autoApprove?: boolean
  noPR?: boolean
  labels?: string // comma-separated labels for ralph-issues
  dryRun?: boolean // ralph-issues dry run mode
}

// ── Run stats (cumulative, tracked on backend) ─────────────────

export interface RalphRunStats {
  checks: number
  agentTurns: number
  reviews: number
  copilotPRs: number
  issuesCreated: number
  scanIterations: number
  totalCost: string | null
  totalPremium: number
}

// ── Run state ───────────────────────────────────────────────────

export interface RalphRunInfo {
  runId: string
  config: RalphLaunchConfig
  status: RalphRunStatus
  phase: RalphRunPhase
  pid: number | null
  currentIteration: number
  totalIterations: number | null
  startedAt: number // epoch ms
  updatedAt: number
  completedAt: number | null
  exitCode: number | null
  error: string | null
  logBuffer: string[] // last N lines of output
  stats: RalphRunStats
}

// ── IPC result types ────────────────────────────────────────────

export interface RalphLaunchResult {
  success: boolean
  runId?: string
  error?: string
}

export interface RalphStopResult {
  success: boolean
  error?: string
}

export interface RalphTemplateInfo {
  name: string
  filename: string
  defaultPrompt?: string
}

// ── Preload API shape (for window.ralph) ────────────────────────

/** @public - referenced by electron/electron-env.d.ts via dynamic import() */
export interface RalphPreloadAPI {
  launch: (config: RalphLaunchConfig) => Promise<RalphLaunchResult>
  stop: (runId: string) => Promise<RalphStopResult>
  list: () => Promise<RalphRunInfo[]>
  getStatus: (runId: string) => Promise<RalphRunInfo | null>
  getConfig: <T extends RalphConfigType>(configType: T) => Promise<RalphConfigMap[T]>
  getScriptsPath: () => Promise<string>
  listTemplates: () => Promise<RalphTemplateInfo[]>
  selectDirectory: (defaultPath?: string) => Promise<string | null>
  onStatusChange: (callback: (...args: unknown[]) => void) => void
  offStatusChange: (callback: (...args: unknown[]) => void) => void
}
