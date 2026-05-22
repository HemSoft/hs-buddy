/**
 * Ralph Loops Service — config reader, process spawner, state tracker.
 *
 * Manages autonomous AI work loop processes (ralph.ps1, ralph-pr.ps1).
 * Follows module-based singleton pattern (see crewService.ts).
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, isAbsolute, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
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

  // process.resourcesPath is Electron-only; guard for non-Electron environments
  const resourcesPath = process.resourcesPath
  if (resourcesPath) {
    const prodPath = join(resourcesPath, VENDORED_SCRIPTS_DIR)
    if (existsSync(prodPath)) return prodPath
    throw new Error(`Ralph scripts not found at ${devPath} or ${prodPath}`)
  }

  throw new Error(`Ralph scripts not found at ${devPath}`)
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
function readScriptContent(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch (_: unknown) {
    return null
  }
}

function extractPromptFromContent(content: string): string | undefined {
  // Pattern 1: PowerShell here-string — $varName = @' ... '@ or @" ... "@
  const hereStringMatch = content.match(/\$\w+Prompt\s*=\s*@(['"])\s*\r?\n([\s\S]*?)\r?\n\1@/)
  if (hereStringMatch) return hereStringMatch[2].trim()
  // Pattern 2: Inline -Prompt "..." or -Prompt '...' on the ralph invocation line
  const inlineMatch = content.match(/-Prompt\s+["']([^"']+)["']/)
  if (inlineMatch) return inlineMatch[1].trim()
  return undefined
}

function extractPromptFromScript(filePath: string): string | undefined {
  const content = readScriptContent(filePath)
  return content ? extractPromptFromContent(content) : undefined
}

function getLeadingCommentLines(content: string): string[] {
  const leadingComments: string[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      if (leadingComments.length > 0) {
        break
      }
      continue
    }
    if (!line.startsWith('#')) {
      break
    }
    leadingComments.push(line.replace(/^#\s?/, '').trim())
  }
  return leadingComments
}

function extractTitleDescription(titleLine: string): string | undefined {
  const titleMatch = titleLine.match(/^.+?\s+[-—]\s*(.*)$/)
  return titleMatch?.[1]?.trim() || undefined
}

function extractDescriptionFromScript(filePath: string): string | undefined {
  const content = readScriptContent(filePath)
  if (!content) return undefined

  const leadingComments = getLeadingCommentLines(content)
  const titleLine = leadingComments[0]
  if (!titleLine) return undefined

  const titleDescription = extractTitleDescription(titleLine)
  if (titleDescription) return titleDescription

  const fallbackComments = leadingComments.slice(1)
  return fallbackComments.find(
    line => line.length > 0 && !line.toLowerCase().startsWith('version:')
  )
}

export function listTemplateScripts(): {
  name: string
  filename: string
  description?: string
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
      description: extractDescriptionFromScript(join(scriptsSubdir, f)),
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

function validateScriptRequirements(config: RalphLaunchConfig): string | null {
  if (config.scriptType === 'ralph-pr' && !config.prNumber) {
    return 'PR number is required for ralph-pr script'
  }
  return null
}

function getProviderValidationError(provider?: string): string | null {
  if (!provider) return null
  if (!VALID_PROVIDERS.has(provider)) {
    return `Invalid provider: ${provider}`
  }
  return null
}

function getModelValidationError(model?: string): string | null {
  if (!model) return null
  return validateModelConfig(model)
}

function validateOptionsConfig(config: RalphLaunchConfig): string | null {
  if (!VALID_SCRIPT_TYPES.has(config.scriptType)) {
    return `Invalid scriptType: ${config.scriptType}`
  }

  const providerError = getProviderValidationError(config.provider)
  if (providerError) return providerError

  const modelError = getModelValidationError(config.model)
  if (modelError) return modelError

  const scriptRequirementError = validateScriptRequirements(config)
  if (scriptRequirementError) return scriptRequirementError

  return validateTimingConfig(config)
}

function validateRange(
  value: number | undefined,
  min: number,
  max: number,
  name: string
): string | null {
  if (value === undefined) return null
  if (value < min || value > max) return `${name} must be between ${min} and ${max}`
  return null
}

function validateTimingConfig(config: RalphLaunchConfig): string | null {
  return (
    validateRange(config.iterations, 1, 100, 'iterations') ??
    validateRange(config.repeats, 1, 50, 'repeats') ??
    (config.workUntil && !/^\d{2}:\d{2}$/.test(config.workUntil)
      ? 'workUntil must be HH:mm format'
      : null)
  )
}

function validateLaunchConfig(config: RalphLaunchConfig): string | null {
  return validatePathConfig(config) ?? validateOptionsConfig(config)
}

// ── Process Spawning ────────────────────────────────────────────

const SCRIPT_TYPE_FILES: Record<string, string> = {
  ralph: 'ralph.ps1',
  'ralph-pr': 'ralph-pr.ps1',
  'ralph-issues': 'ralph-issues.ps1',
}

function resolveTemplateScriptPath(scriptsDir: string, config: RalphLaunchConfig): string {
  const vendoredPath = join(scriptsDir, 'scripts', config.templateScript!)
  if (existsSync(vendoredPath)) return vendoredPath
  const repoPath = join(config.repoPath, 'scripts', config.templateScript!)
  if (existsSync(repoPath)) return repoPath
  throw new Error(`Template script not found: ${config.templateScript}`)
}

function resolveScriptPath(config: RalphLaunchConfig): string {
  const scriptsDir = getScriptsDir()
  const builtinFile = SCRIPT_TYPE_FILES[config.scriptType]
  if (builtinFile) return join(scriptsDir, builtinFile)
  if (config.templateScript) return resolveTemplateScriptPath(scriptsDir, config)
  throw new Error('Cannot resolve script path')
}

function collectAllAgents(config: RalphLaunchConfig): string[] {
  const devAgentArr = config.devAgent ? [config.devAgent] : []
  return [...devAgentArr, ...(config.agents ?? [])]
}

function appendArg(args: string[], flag: string, value: string): void {
  args.push(flag, value)
}

function appendOptionalStringArg(args: string[], flag: string, value?: string): void {
  if (!value) return
  appendArg(args, flag, value)
}

function appendJoinedArgs(args: string[], flag: string, values: string[]): void {
  if (values.length === 0) return
  appendArg(args, flag, values.join(','))
}

// ralph-pr uses separate -DevAgent param; ralph.ps1 mixes dev into -Agents
function appendAgentArgs(args: string[], config: RalphLaunchConfig): void {
  if (config.scriptType === 'ralph-pr') {
    appendOptionalStringArg(args, '-DevAgent', config.devAgent)
    appendJoinedArgs(args, '-Agents', config.agents ?? [])
    return
  }

  appendJoinedArgs(args, '-Agents', collectAllAgents(config))
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

function appendStringArgs(args: string[], config: RalphLaunchConfig): void {
  appendOptionalStringArg(args, '-Model', config.model)
  appendOptionalStringArg(args, '-Provider', config.provider)
  appendOptionalStringArg(args, '-WorkUntil', config.workUntil)
  appendOptionalStringArg(args, '-Branch', config.branch)
  appendOptionalStringArg(args, '-Labels', config.labels)
}

function appendOptionalArgs(args: string[], config: RalphLaunchConfig): void {
  appendStringArgs(args, config)
  appendAgentArgs(args, config)
  if (config.iterations) args.push('-Max', String(config.iterations))
  if (config.prompt) args.push('-Prompt', resolvePromptArg(config.prompt))
  if (config.prNumber) args.push('-PRNumber', String(config.prNumber))
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

function getRalphErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function resolveScriptPathSafe(config: RalphLaunchConfig): { scriptPath: string | null; error: string | null } {
  try {
    return { scriptPath: resolveScriptPath(config), error: null }
  } catch (err: unknown) {
    return { scriptPath: null, error: getRalphErrorMessage(err) }
  }
}

function createRunInfo(runId: string, config: RalphLaunchConfig, proc: ChildProcess): RalphRunInfo {
  return {
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
}

function getOutputLines(data: Buffer): string[] {
  return data.toString().split('\n').filter(Boolean)
}

function appendStdout(runId: string, data: Buffer): void {
  for (const line of getOutputLines(data)) {
    appendLogLine(runId, line)
    parseOutputLine(runId, line)
  }
}

function appendStderr(runId: string, data: Buffer): void {
  for (const line of getOutputLines(data)) {
    appendLogLine(runId, `[stderr] ${line}`)
  }
}

function getTerminalStatus(code: number | null): 'completed' | 'failed' {
  return code === 0 ? 'completed' : 'failed'
}

function handleRunClose(runId: string, code: number | null): void {
  const run = activeRuns.get(runId)
  if (run && run.status !== 'cancelled') {
    const terminal = getTerminalStatus(code)
    Object.assign(run, {
      exitCode: code,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      status: terminal,
      phase: terminal,
    })
    emitStatusChange(run)
  }
  activeProcesses.delete(runId)
}

function handleRunError(runId: string, err: Error): void {
  const run = activeRuns.get(runId)
  if (run) {
    Object.assign(run, {
      status: 'failed',
      phase: 'failed',
      error: err.message,
      updatedAt: Date.now(),
      completedAt: Date.now(),
    })
    emitStatusChange(run)
  }
  activeProcesses.delete(runId)
}

function attachProcessListeners(runId: string, proc: ChildProcess): void {
  proc.stdout.on('data', (data: Buffer) => {
    appendStdout(runId, data)
  })
  proc.stderr.on('data', (data: Buffer) => {
    appendStderr(runId, data)
  })
  proc.on('close', code => {
    handleRunClose(runId, code)
  })
  proc.on('error', err => {
    handleRunError(runId, err)
  })
}

export function launchLoop(config: RalphLaunchConfig): RalphLaunchResult {
  const validationError = validateLaunchConfig(config)
  if (validationError) return { success: false, error: validationError }

  const scriptResult = resolveScriptPathSafe(config)
  if (!scriptResult.scriptPath || scriptResult.error) {
    return { success: false, error: scriptResult.error ?? 'Cannot resolve script path' }
  }

  const runId = randomUUID()
  const args = buildArgs(config, scriptResult.scriptPath)
  const proc = spawn('pwsh', args, {
    cwd: config.repoPath,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })

  activeRuns.set(runId, createRunInfo(runId, config, proc))
  activeProcesses.set(runId, proc)
  attachProcessListeners(runId, proc)

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

function updateRunPhase(run: RalphRunInfo, phase: RalphRunInfo['phase']): void {
  run.phase = phase
  run.updatedAt = Date.now()
  emitStatusChange(run)
}

function detectIterationPhase(run: RalphRunInfo, clean: string): void {
  const iterMatch = clean.match(/=== ITERATION (\d+)/)
  if (!iterMatch) return
  run.currentIteration = Number.parseInt(iterMatch[1], 10)
  updateRunPhase(run, 'iterating')
}

function detectHandoffPhase(run: RalphRunInfo, clean: string): void {
  if (!clean.includes('Handing off to ralph-pr')) return
  updateRunPhase(run, 'pr-handoff')
}

function detectResolvingPhase(run: RalphRunInfo, clean: string): void {
  if (!clean.includes('PR review cycle') && !clean.includes('Checking CI status')) return
  updateRunPhase(run, 'pr-resolving')
}

function detectScanningPhase(run: RalphRunInfo, clean: string): void {
  if (!/^={2,}\s*Scan Iteration\s+\d+/i.test(clean)) return
  run.stats.scanIterations++
  run.currentIteration = run.stats.scanIterations
  updateRunPhase(run, 'scanning')
}

function detectPhase(run: RalphRunInfo, clean: string): void {
  detectIterationPhase(run, clean)
  detectHandoffPhase(run, clean)
  detectResolvingPhase(run, clean)
  detectScanningPhase(run, clean)
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
      r.stats.totalPremium = Number.parseInt(m[2], 10)
    },
  },
  {
    pattern: /GRAND TOTAL:\s+\$([0-9.]+)\s+\((\d+)\s+premium/i,
    update: (r, m) => {
      r.stats.totalCost = `$${m[1]}`
      r.stats.totalPremium = Number.parseInt(m[2], 10)
    },
  },
  {
    pattern: /Issues created this iteration:\s+(\d+)/i,
    update: (r, m) => {
      r.stats.issuesCreated += Number.parseInt(m[1], 10)
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

function killProcess(proc: { pid?: number; kill: (signal: string) => void }): void {
  if (process.platform === 'win32' && proc.pid) {
    execSync(`taskkill /T /F /PID ${proc.pid}`, { timeout: KILL_TIMEOUT_MS })
  } else {
    proc.kill('SIGTERM')
  }
}

function markRunStopped(run: RalphRunInfo, status: 'cancelled' | 'failed', error?: string): void {
  run.status = status
  run.phase = 'failed'
  run.updatedAt = Date.now()
  run.completedAt = Date.now()
  if (error) run.error = error
  emitStatusChange(run)
}

function isLoopRunning(proc: ChildProcess | undefined, run: RalphRunInfo): boolean {
  if (!proc) return false
  return run.status === 'running'
}

export function stopLoop(runId: string): RalphStopResult {
  const proc = activeProcesses.get(runId)
  const run = activeRuns.get(runId)

  if (!run) return { success: false, error: `Run not found: ${runId}` }
  if (!isLoopRunning(proc, run)) {
    return { success: false, error: `Run ${runId} is not running (status: ${run.status})` }
  }

  try {
    killProcess(proc)
    markRunStopped(run, 'cancelled')
    activeProcesses.delete(runId)
    return { success: true }
  } catch (err: unknown) {
    const msg = `Failed to stop: ${getRalphErrorMessage(err)}`
    markRunStopped(run, 'failed', msg)
    return { success: false, error: msg }
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
