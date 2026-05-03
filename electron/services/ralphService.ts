/**
 * Ralph Loops Service — config reader, process spawner, state tracker.
 *
 * Manages autonomous AI work loop processes (ralph.ps1, ralph-pr.ps1).
 * Follows module-based singleton pattern (see crewService.ts).
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve, isAbsolute, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import type {
  RalphLaunchConfig,
  RalphRunInfo,
  RalphModelsConfig,
  RalphAgentsConfig,
  RalphProvidersConfig,
  RalphConfigType,
  RalphConfigMap,
  RalphLaunchResult,
  RalphStopResult,
} from '../../src/types/ralph'

// ── Constants ───────────────────────────────────────────────────

const MAX_LOG_BUFFER = 5000
const VENDORED_SCRIPTS_DIR = 'scripts/ralph-loops'
const KILL_TIMEOUT_MS = 5_000

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Event callback for real-time push to renderer ───────────────

type StatusChangeCallback = (run: RalphRunInfo) => void
let onStatusChange: StatusChangeCallback | null = null

export function setStatusChangeCallback(cb: StatusChangeCallback | null): void {
  onStatusChange = cb
}

function emitStatusChange(run: RalphRunInfo): void {
  onStatusChange?.(run)
}

// ── State ───────────────────────────────────────────────────────

const activeRuns = new Map<string, RalphRunInfo>()
const activeProcesses = new Map<string, ChildProcess>()

// ── Config ──────────────────────────────────────────────────────

function getScriptsDir(): string {
  // Vendored scripts are relative to the app root (in dev) or resources (in prod)
  // __dirname is dist-electron/ in dev, so go one level up to reach project root
  const devPath = resolve(__dirname, '..', VENDORED_SCRIPTS_DIR)
  if (existsSync(devPath)) return devPath

  const prodPath = join(process.resourcesPath ?? '', VENDORED_SCRIPTS_DIR)
  if (existsSync(prodPath)) return prodPath

  throw new Error(`Ralph scripts not found at ${devPath} or ${prodPath}`)
}

function readJsonConfig<T>(filename: string): T {
  const filePath = join(getScriptsDir(), 'config', filename)
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`)
  }
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T
}

function getModels(): RalphModelsConfig {
  return readJsonConfig<RalphModelsConfig>('models.json')
}

function getAgents(): RalphAgentsConfig {
  return readJsonConfig<RalphAgentsConfig>('agents.json')
}

function getProviders(): RalphProvidersConfig {
  return readJsonConfig<RalphProvidersConfig>('providers.json')
}

export function getConfig<T extends RalphConfigType>(configType: T): RalphConfigMap[T] {
  const readers: Record<RalphConfigType, () => unknown> = {
    models: getModels,
    agents: getAgents,
    providers: getProviders,
  }
  return readers[configType]() as RalphConfigMap[T]
}

export function getScriptsPath(): string {
  return getScriptsDir()
}

/** List available template scripts from the vendored scripts/ directory. */
/** Extract the default prompt embedded in a ralph template .ps1 script. */
function extractPromptFromScript(filePath: string): string | undefined {
  try {
    const content = readFileSync(filePath, 'utf-8')
    // Pattern 1: PowerShell here-string — $varName = @' ... '@
    const hereStringMatch = content.match(/\$\w+Prompt\s*=\s*@'\s*\r?\n([\s\S]*?)\r?\n'@/)
    if (hereStringMatch) return hereStringMatch[1].trim()
    // Pattern 2: Inline -Prompt "..." or -Prompt '...' on the ralph invocation line
    const inlineMatch = content.match(/-Prompt\s+["']([^"']+)["']/)
    if (inlineMatch) return inlineMatch[1].trim()
  } catch (_: unknown) {
    // Script unreadable — return no prompt
  }
  return undefined
}

export function listTemplateScripts(): {
  name: string
  filename: string
  defaultPrompt?: string
}[] {
  const scriptsSubdir = join(getScriptsDir(), 'scripts')
  if (!existsSync(scriptsSubdir)) return []
  return readdirSync(scriptsSubdir)
    .filter(f => f.endsWith('.ps1') && !f.includes('-repeat') && !f.includes('-run-all'))
    .map(f => ({
      filename: f,
      name: f
        .replace(/^ralph-/, '')
        .replace(/\.ps1$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase()),
      defaultPrompt: extractPromptFromScript(join(scriptsSubdir, f)),
    }))
}

// ── Validation ──────────────────────────────────────────────────

const VALID_SCRIPT_TYPES = new Set(['ralph', 'ralph-pr', 'ralph-issues', 'template'])
const VALID_PROVIDERS = new Set(['copilot', 'opencode', 'copilot-go', 'openrouter'])
const DANGEROUS_PATH_CHARS = /[;&|`$]/

function validatePathConfig(config: RalphLaunchConfig): string | null {
  if (!config.repoPath || !isAbsolute(config.repoPath)) {
    return 'repoPath must be an absolute path'
  }
  if (!existsSync(config.repoPath)) {
    return `repoPath does not exist: ${config.repoPath}`
  }
  if (DANGEROUS_PATH_CHARS.test(config.repoPath)) {
    return 'repoPath contains forbidden characters'
  }
  return null
}

function validateModelConfig(model: string): string | null {
  const models = getModels()
  const validModelKeys = new Set([
    ...Object.keys(models.models),
    ...Object.keys(models.aliases),
    ...Object.keys(models.tiers),
  ])
  if (!validModelKeys.has(model)) {
    return `Unknown model: ${model}. Valid: ${[...validModelKeys].join(', ')}`
  }
  return null
}

function validateOptionsConfig(config: RalphLaunchConfig): string | null {
  if (!VALID_SCRIPT_TYPES.has(config.scriptType)) {
    return `Invalid scriptType: ${config.scriptType}`
  }
  if (config.provider && !VALID_PROVIDERS.has(config.provider)) {
    return `Invalid provider: ${config.provider}`
  }
  if (config.model && validateModelConfig(config.model)) {
    return validateModelConfig(config.model)
  }
  if (config.scriptType === 'ralph-pr' && !config.prNumber) {
    return 'PR number is required for ralph-pr script'
  }
  return validateTimingConfig(config)
}

function validateTimingConfig(config: RalphLaunchConfig): string | null {
  if (config.iterations !== undefined && (config.iterations < 1 || config.iterations > 100)) {
    return 'iterations must be between 1 and 100'
  }
  if (config.repeats !== undefined && (config.repeats < 1 || config.repeats > 50)) {
    return 'repeats must be between 1 and 50'
  }
  if (config.workUntil && !/^\d{2}:\d{2}$/.test(config.workUntil)) {
    return 'workUntil must be HH:mm format'
  }
  return null
}

function validateLaunchConfig(config: RalphLaunchConfig): string | null {
  return validatePathConfig(config) ?? validateOptionsConfig(config)
}

// ── Process Spawning ────────────────────────────────────────────

function resolveScriptPath(config: RalphLaunchConfig): string {
  const scriptsDir = getScriptsDir()
  if (config.scriptType === 'ralph') return join(scriptsDir, 'ralph.ps1')
  if (config.scriptType === 'ralph-pr') return join(scriptsDir, 'ralph-pr.ps1')
  if (config.scriptType === 'ralph-issues') return join(scriptsDir, 'ralph-issues.ps1')
  // Template scripts: check vendored scripts/ dir first, then repo's scripts/ dir
  if (config.scriptType === 'template' && config.templateScript) {
    const vendoredPath = join(scriptsDir, 'scripts', config.templateScript)
    if (existsSync(vendoredPath)) return vendoredPath
    const repoPath = join(config.repoPath, 'scripts', config.templateScript)
    if (existsSync(repoPath)) return repoPath
    throw new Error(`Template script not found: ${config.templateScript}`)
  }
  throw new Error('Cannot resolve script path')
}

// ralph-pr uses separate -DevAgent param; ralph.ps1 mixes dev into -Agents
function appendAgentArgs(args: string[], config: RalphLaunchConfig): void {
  if (config.scriptType === 'ralph-pr') {
    if (config.devAgent) args.push('-DevAgent', config.devAgent)
    if (config.agents?.length) args.push('-Agents', config.agents.join(','))
  } else {
    const allAgents = [...(config.devAgent ? [config.devAgent] : []), ...(config.agents ?? [])]
    if (allAgents.length) args.push('-Agents', allAgents.join(','))
  }
}

// Write multi-line or long prompts to a temp file to avoid Windows
// command-line encoding issues (quotes, newlines, special chars).
// ralph.ps1's Resolve-PromptText reads the file when -Prompt is a path.
function resolvePromptArg(prompt: string): string {
  if (prompt.includes('\n') || prompt.length > 500) {
    const promptFile = join(tmpdir(), `ralph-prompt-${randomUUID().slice(0, 8)}.md`)
    writeFileSync(promptFile, prompt, 'utf-8')
    return promptFile
  }
  return prompt
}

function appendOptionalArgs(args: string[], config: RalphLaunchConfig): void {
  if (config.model) args.push('-Model', config.model)
  if (config.provider) args.push('-Provider', config.provider)
  appendAgentArgs(args, config)
  if (config.iterations) args.push('-Max', String(config.iterations))
  if (config.workUntil) args.push('-WorkUntil', config.workUntil)
  if (config.branch) args.push('-Branch', config.branch)
  if (config.prompt) args.push('-Prompt', resolvePromptArg(config.prompt))
  if (config.prNumber) args.push('-PRNumber', String(config.prNumber))
  if (config.labels) args.push('-Labels', config.labels)
  if (config.dryRun) args.push('-DryRun')
}

function appendBooleanFlags(args: string[], config: RalphLaunchConfig): void {
  if (config.noAudio) args.push('-NoAudio')
  if (config.skipReview) args.push('-SkipReview')
  if (config.autoApprove) args.push('-AutoApprove')
}

function buildArgs(config: RalphLaunchConfig, scriptPath: string): string[] {
  const useRepeat = config.repeats && config.repeats > 1

  if (useRepeat) {
    // Wrap with generic repeat script
    const repeatScript = join(getScriptsDir(), 'scripts', 'ralph-repeat.ps1')
    const args: string[] = ['-NoProfile', '-File', repeatScript]
    args.push('-Script', scriptPath)
    args.push('-Times', String(config.repeats))

    // Pass common options through to the repeat wrapper (which forwards to base script)
    appendOptionalArgs(args, config)
    appendBooleanFlags(args, config)

    return args
  }

  const args: string[] = ['-NoProfile', '-File', scriptPath]

  // ralph-issues doesn't support -Autopilot; other scripts need it (no PTY)
  if (config.scriptType !== 'ralph-issues') {
    args.push('-Autopilot')
  }

  appendOptionalArgs(args, config)
  appendBooleanFlags(args, config)
  if (config.noPR) args.push('-NoPR')

  return args
}

export function launchLoop(config: RalphLaunchConfig): RalphLaunchResult {
  const validationError = validateLaunchConfig(config)
  if (validationError) return { success: false, error: validationError }

  const runId = randomUUID()

  let scriptPath: string
  try {
    scriptPath = resolveScriptPath(config)
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }

  const args = buildArgs(config, scriptPath)

  const proc = spawn('pwsh', args, {
    cwd: config.repoPath,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })

  const run: RalphRunInfo = {
    runId,
    config,
    status: 'running',
    phase: 'initializing',
    pid: proc.pid ?? null,
    currentIteration: 0,
    totalIterations: config.iterations ?? null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
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
  }

  activeRuns.set(runId, run)
  activeProcesses.set(runId, proc)

  // Stream stdout
  proc.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      appendLogLine(runId, line)
      parseOutputLine(runId, line)
    }
  })

  // Stream stderr
  proc.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      appendLogLine(runId, `[stderr] ${line}`)
    }
  })

  // Handle exit
  proc.on('close', code => {
    const r = activeRuns.get(runId)
    if (r) {
      // Respect manually-set terminal status (e.g. 'cancelled' from stopLoop)
      if (r.status !== 'cancelled') {
        r.exitCode = code
        r.completedAt = Date.now()
        r.updatedAt = Date.now()
        r.status = code === 0 ? 'completed' : 'failed'
        r.phase = code === 0 ? 'completed' : 'failed'
        emitStatusChange(r)
      }
    }
    activeProcesses.delete(runId)
  })

  proc.on('error', err => {
    const r = activeRuns.get(runId)
    if (r) {
      r.status = 'failed'
      r.phase = 'failed'
      r.error = err.message
      r.updatedAt = Date.now()
      r.completedAt = Date.now()
      emitStatusChange(r)
    }
    activeProcesses.delete(runId)
  })

  return { success: true, runId }
}

// ── Output Parsing ──────────────────────────────────────────────

// Strip ANSI escape sequences from process output
// eslint-disable-next-line no-control-regex -- intentional: matching ESC byte in terminal output
const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]/g

function appendLogLine(runId: string, line: string): void {
  const run = activeRuns.get(runId)
  if (!run) return
  run.logBuffer.push(line.replace(ANSI_RE, ''))
  if (run.logBuffer.length > MAX_LOG_BUFFER) {
    run.logBuffer.shift()
  }
}

function detectPhase(run: RalphRunInfo, clean: string): void {
  const iterMatch = clean.match(/=== ITERATION (\d+)/)
  if (iterMatch) {
    run.currentIteration = parseInt(iterMatch[1], 10)
    run.phase = 'iterating'
    run.updatedAt = Date.now()
    emitStatusChange(run)
  }

  if (clean.includes('Handing off to ralph-pr')) {
    run.phase = 'pr-handoff'
    run.updatedAt = Date.now()
    emitStatusChange(run)
  }

  if (clean.includes('PR review cycle') || clean.includes('Checking CI status')) {
    run.phase = 'pr-resolving'
    run.updatedAt = Date.now()
    emitStatusChange(run)
  }

  // ralph-issues scan iteration markers: "== Scan Iteration N/"
  if (/^={2,}\s*Scan Iteration\s+\d+/i.test(clean)) {
    run.stats.scanIterations++
    run.currentIteration = run.stats.scanIterations
    run.phase = 'scanning'
    run.updatedAt = Date.now()
    emitStatusChange(run)
  }
}

type StatMatcher = {
  pattern: RegExp
  update: (run: RalphRunInfo, match: RegExpMatchArray) => void
}

const STAT_MATCHERS: StatMatcher[] = [
  {
    pattern: /^={2,}\s*Check\s+\d+/i,
    update: r => {
      r.stats.checks++
    },
  },
  {
    pattern: /AGENT REVIEW\s*\[|Agent .+ review done/i,
    update: r => {
      r.stats.agentTurns++
    },
  },
  {
    pattern: /Copilot review requested|request-copilot-review/i,
    update: r => {
      r.stats.copilotPRs++
    },
  },
  {
    pattern: /review round \d+|PR quality review/i,
    update: r => {
      r.stats.reviews++
    },
  },
  {
    pattern: /^\s+Cost\s+\$([0-9.]+)\s+\((\d+)\s+premium/i,
    update: (r, m) => {
      r.stats.totalCost = `$${m[1]}`
      r.stats.totalPremium = parseInt(m[2], 10)
    },
  },
  {
    pattern: /GRAND TOTAL:\s+\$([0-9.]+)\s+\((\d+)\s+premium/i,
    update: (r, m) => {
      r.stats.totalCost = `$${m[1]}`
      r.stats.totalPremium = parseInt(m[2], 10)
    },
  },
  {
    pattern: /Issues created this iteration:\s+(\d+)/i,
    update: (r, m) => {
      r.stats.issuesCreated += parseInt(m[1], 10)
    },
  },
]

function trackStats(run: RalphRunInfo, clean: string): void {
  for (const { pattern, update } of STAT_MATCHERS) {
    const m = clean.match(pattern)
    if (m) {
      update(run, m)
      run.updatedAt = Date.now()
      emitStatusChange(run)
    }
  }
}

function parseOutputLine(runId: string, line: string): void {
  const run = activeRuns.get(runId)
  if (!run) return

  const clean = line.replace(ANSI_RE, '')
  detectPhase(run, clean)
  trackStats(run, clean)
}

// ── Run Management ──────────────────────────────────────────────

export function stopLoop(runId: string): RalphStopResult {
  const proc = activeProcesses.get(runId)
  const run = activeRuns.get(runId)

  if (!run) return { success: false, error: `Run not found: ${runId}` }
  if (!proc || run.status !== 'running') {
    return { success: false, error: `Run ${runId} is not running (status: ${run.status})` }
  }

  try {
    // Windows: kill the entire process tree
    if (process.platform === 'win32' && proc.pid) {
      execSync(`taskkill /T /F /PID ${proc.pid}`, { timeout: KILL_TIMEOUT_MS })
    } else {
      proc.kill('SIGTERM')
    }

    run.status = 'cancelled'
    run.phase = 'failed'
    run.updatedAt = Date.now()
    run.completedAt = Date.now()
    activeProcesses.delete(runId)
    emitStatusChange(run)

    return { success: true }
  } catch (err: unknown) {
    run.status = 'failed'
    run.phase = 'failed'
    run.updatedAt = Date.now()
    run.error = `Failed to stop: ${err instanceof Error ? err.message : String(err)}`
    emitStatusChange(run)
    return { success: false, error: run.error }
  }
}

export function listLoops(): RalphRunInfo[] {
  return [...activeRuns.values()]
}

export function getLoopStatus(runId: string): RalphRunInfo | null {
  return activeRuns.get(runId) ?? null
}

// ── Lifecycle ───────────────────────────────────────────────────

/** Mark any lingering "running" entries as orphaned on startup. */
export function initRalphService(): void {
  for (const [id, run] of activeRuns) {
    if (run.status === 'running') {
      run.status = 'orphaned'
      run.updatedAt = Date.now()
      run.completedAt = Date.now()
      activeProcesses.delete(id)
    }
  }
}

/** Kill all active processes on app shutdown. */
export function shutdownRalphService(): void {
  for (const [runId] of activeProcesses) {
    stopLoop(runId)
  }
  activeRuns.clear()
  activeProcesses.clear()
}

// ── Log Directory ───────────────────────────────────────────────
