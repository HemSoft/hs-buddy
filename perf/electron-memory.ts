import {
  execFile as execFileCallback,
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { connect, type Browser, type Page } from 'puppeteer-core'
import {
  aggregateProcessMemory,
  buildMedianScenario,
  evaluateAbsoluteBudgets,
  evaluateCleanupBudget,
  formatBytes,
  identifyNewRendererProcessesAsWebviews,
  PACKAGED_MEMORY_BUDGETS,
  type BudgetFailure,
  type ProcessKind,
  type ProcessMemorySample,
  type RendererMemorySample,
  type ScenarioMetrics,
} from './electron-memory-model'

const execFile = promisify(execFileCallback)
const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_WARMUP_MS = 5 * 60 * 1_000
const DEFAULT_SETTLE_MS = 5_000
const DEFAULT_NAVIGATION_CYCLES = 3
const DEFAULT_CONVEX_URL = 'https://placeholder-memory-harness.convex.cloud'

type HarnessMode = 'packaged' | 'development'

interface HarnessOptions {
  mode: HarnessMode
  runs: number
  warmupMs: number
  settleMs: number
  navigationCycles: number
  skipBuild: boolean
  budgetScale: number
  outputPath: string | null
  recordBaselinePath: string | null
}

interface RuntimeMetadata {
  electronVersion: string
  appVersion: string
}

interface LaunchedRuntime extends RuntimeMetadata {
  browser: Browser
  child: ChildProcessWithoutNullStreams
  page: Page
  output: string[]
}

interface OsProcessMetric {
  pid: number
  parentPid: number | null
  name: string | null
  workingSetBytes: number
  privateBytes: number | null
  commandLine: string | null
}

interface HarnessRun {
  run: number
  mode: HarnessMode
  electronVersion: string
  appVersion: string
  profilePath: string
  scenarios: Record<string, ScenarioMetrics>
  failures: BudgetFailure[]
  observedProcessKinds: ProcessKind[]
}

interface HarnessResult {
  schema: 1
  capturedAt: string
  platform: string
  architecture: string
  options: HarnessOptions
  budgets: {
    totalWorkingSetBytes: number
    rendererWorkingSetBytes: number
    cleanupRatio: number
  }
  runs: HarnessRun[]
  medians: Record<string, ReturnType<typeof buildMedianScenario>>
  failures: BudgetFailure[]
  status: 'pass' | 'fail' | 'informational'
}

const HELP = [
  'Usage: bun perf/electron-memory.ts [options]',
  '',
  'Options:',
  '  --mode <packaged|development>  Runtime to measure (default: packaged)',
  '  --runs <n>                    Fresh isolated profiles to run (default: 1)',
  '  --warmup-ms <n>               Dashboard idle warmup (default: 300000)',
  '  --settle-ms <n>               Cleanup settling delay (default: 5000)',
  '  --navigation-cycles <n>       Representative route cycles (default: 3)',
  '  --skip-build                  Reuse the existing Vite/package output',
  '  --budget-scale <n>            Scale absolute caps for harness self-test',
  '  --output <path>               Write the full JSON result',
  '  --record-baseline <path>      Write median baseline JSON',
  '  --help                        Show this help',
].join('\n')

function parsePositiveNumber(raw: string | undefined, flag: string, integer = false): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${flag} requires a positive ${integer ? 'integer' : 'number'}`)
  }
  return value
}

function parseNonNegativeNumber(raw: string | undefined, flag: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${flag} requires a non-negative number`)
  return value
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parseMode(value: string): HarnessMode {
  if (value === 'packaged' || value === 'development') return value
  throw new Error('--mode must be packaged or development')
}

export function parseArgs(args: string[]): HarnessOptions | null {
  const options: HarnessOptions = {
    mode: 'packaged',
    runs: 1,
    warmupMs: DEFAULT_WARMUP_MS,
    settleMs: DEFAULT_SETTLE_MS,
    navigationCycles: DEFAULT_NAVIGATION_CYCLES,
    skipBuild: false,
    budgetScale: 1,
    outputPath: null,
    recordBaselinePath: null,
  }

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--help') return null
    if (flag === '--skip-build') {
      options.skipBuild = true
      continue
    }
    const value = readValue(args, index, flag)
    index += 1
    applyOption(options, flag, value)
  }
  return options
}

function applyOption(options: HarnessOptions, flag: string, value: string): void {
  const handlers: Record<string, () => void> = {
    '--mode': () => {
      options.mode = parseMode(value)
    },
    '--runs': () => {
      options.runs = parsePositiveNumber(value, flag, true)
    },
    '--warmup-ms': () => {
      options.warmupMs = parseNonNegativeNumber(value, flag)
    },
    '--settle-ms': () => {
      options.settleMs = parseNonNegativeNumber(value, flag)
    },
    '--navigation-cycles': () => {
      options.navigationCycles = parsePositiveNumber(value, flag, true)
    },
    '--budget-scale': () => {
      options.budgetScale = parsePositiveNumber(value, flag)
    },
    '--output': () => {
      options.outputPath = path.resolve(value)
    },
    '--record-baseline': () => {
      options.recordBaselinePath = path.resolve(value)
    },
  }
  const handler = handlers[flag]
  if (!handler) throw new Error(`Unknown option: ${flag}`)
  handler()
}

function runTool(args: string[]): void {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: {
      ...cleanEnvironment(),
      VITE_CONVEX_URL: process.env.VITE_CONVEX_URL ?? DEFAULT_CONVEX_URL,
    },
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`Command failed: bun ${args.join(' ')}`)
}

async function readPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
    version: string
  }
  return packageJson.version
}

async function prepareRuntime(options: HarnessOptions): Promise<string> {
  if (options.mode === 'packaged' && process.platform !== 'win32') {
    throw new Error('The committed absolute packaged budget currently targets Windows x64')
  }
  if (!options.skipBuild) {
    runTool(['x', 'vite', 'build'])
    if (options.mode === 'packaged') {
      runTool(['x', 'electron-builder', '--dir', '--win', '--x64', '-c.npmRebuild=false'])
    }
  }
  if (options.mode === 'development') return require('electron') as string
  const version = await readPackageVersion()
  const executablePath = path.join(ROOT, 'release', version, 'win-unpacked', 'Buddy.exe')
  return executablePath
}

function cleanEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value]]
    )
  )
}

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  )
  if (!address || typeof address === 'string') throw new Error('Could not reserve a CDP port')
  return address.port
}

function retainOutput(output: string[], chunk: Buffer): void {
  output.push(...chunk.toString('utf8').split(/\r?\n/).filter(Boolean))
  if (output.length > 200) output.splice(0, output.length - 200)
}

async function waitForCdp(
  endpoint: string,
  child: ChildProcessWithoutNullStreams,
  output: string[]
): Promise<{ userAgent: string; webSocketUrl: string }> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Electron exited before CDP was ready (${child.exitCode})\n${output.join('\n')}`
      )
    }
    try {
      const response = await fetch(`${endpoint}/json/version`)
      if (response.ok) {
        const version = (await response.json()) as {
          'User-Agent'?: string
          webSocketDebuggerUrl?: string
        }
        if (version.webSocketDebuggerUrl) {
          return {
            userAgent: version['User-Agent'] ?? '',
            webSocketUrl: version.webSocketDebuggerUrl,
          }
        }
      }
    } catch (_: unknown) {
      // The endpoint is not listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${endpoint}\n${output.join('\n')}`)
}

async function waitForRendererTarget(endpoint: string): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/list`)
      if (response.ok) {
        const targets = (await response.json()) as Array<{ type?: string; url?: string }>
        if (targets.some(target => target.type === 'page' && Boolean(target.url))) {
          await new Promise(resolve => setTimeout(resolve, 5_000))
          return
        }
      }
    } catch (_: unknown) {
      // The renderer target is not published yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for Electron renderer target at ${endpoint}`)
}

async function firstPage(browser: Browser): Promise<Page> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const pages = await browser.pages()
    if (pages[0]) return pages[0]
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Electron exposed no renderer page')
}

async function launchRuntime(
  options: HarnessOptions,
  executablePath: string,
  profilePath: string
): Promise<LaunchedRuntime> {
  const port = await reservePort()
  const profileArg = `--user-data-dir=${profilePath}`
  const args = options.mode === 'development' ? [ROOT, profileArg] : [profileArg]
  const output: string[] = []
  const child = spawn(executablePath, args, {
    cwd: ROOT,
    env: {
      ...cleanEnvironment(),
      BUDDY_DEBUG_PORT: String(port),
      BUDDY_MEMORY_HARNESS: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.on('data', chunk => retainOutput(output, chunk as Buffer))
  child.stderr.on('data', chunk => retainOutput(output, chunk as Buffer))
  const endpoint = `http://127.0.0.1:${port}`
  console.log(`Launching Electron pid=${child.pid} CDP=${endpoint}`)
  const cdp = await waitForCdp(endpoint, child, output)
  console.log('Electron CDP browser endpoint is ready')
  await waitForRendererTarget(endpoint)
  console.log('Electron renderer target is ready')
  const browser = await connect({ browserWSEndpoint: cdp.webSocketUrl })
  console.log('Connected Puppeteer to Electron CDP')
  const page = await firstPage(browser)
  console.log('Connected to Electron renderer page')
  const electronVersion = /Electron\/([^\s]+)/.exec(cdp.userAgent)?.[1] ?? 'unknown'
  return {
    browser,
    child,
    page,
    output,
    electronVersion,
    appVersion: await readPackageVersion(),
  }
}

function parseWindowsProcess(value: Record<string, unknown>): OsProcessMetric {
  const numberValue = (key: string): number => Number(value[key] ?? 0)
  return {
    pid: numberValue('ProcessId'),
    parentPid: numberValue('ParentProcessId') || null,
    name: typeof value.Name === 'string' ? value.Name : null,
    workingSetBytes: numberValue('WorkingSetSize'),
    privateBytes: numberValue('PrivatePageCount') || null,
    commandLine: typeof value.CommandLine === 'string' ? value.CommandLine : null,
  }
}

async function getWindowsProcessTree(rootPid: number): Promise<OsProcessMetric[]> {
  const script = [
    `$rootPid = ${rootPid}`,
    '$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,PrivatePageCount,CommandLine)',
    '$ids = [System.Collections.Generic.HashSet[uint32]]::new()',
    '[void]$ids.Add([uint32]$rootPid)',
    'do {',
    '  $added = $false',
    '  foreach ($process in $all) {',
    '    if ($ids.Contains([uint32]$process.ParentProcessId) -and $ids.Add([uint32]$process.ProcessId)) { $added = $true }',
    '  }',
    '} while ($added)',
    '$all | Where-Object { $ids.Contains([uint32]$_.ProcessId) } | ConvertTo-Json -Compress',
  ].join('; ')
  const shell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
  const { stdout } = await execFile(
    shell,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    {
      maxBuffer: 10 * 1024 * 1024,
    }
  )
  const parsed = JSON.parse(stdout || '[]') as Record<string, unknown> | Record<string, unknown>[]
  return (Array.isArray(parsed) ? parsed : [parsed]).map(parseWindowsProcess)
}

async function getOsProcessTree(rootPid: number): Promise<OsProcessMetric[]> {
  if (process.platform === 'win32') return getWindowsProcessTree(rootPid)
  return []
}

function readProcessType(commandLine: string): string | null {
  return /(?:^|\s)--type=([^\s"]+)/.exec(commandLine)?.[1] ?? null
}

function classifyProcess(metric: OsProcessMetric, rootPid: number): ProcessKind {
  if (metric.pid === rootPid) return 'main'
  const commandLine = metric.commandLine ?? ''
  const type = readProcessType(commandLine)
  if (type === 'renderer') {
    return /--webview-tag|--guest-instance-id/.test(commandLine) ? 'webview' : 'renderer'
  }
  if (type === 'gpu-process') return 'gpu'
  if (type === 'utility') return 'utility'
  return type ? 'other' : 'spawned-child'
}

function buildProcessSamples(
  rootPid: number,
  osProcesses: OsProcessMetric[]
): ProcessMemorySample[] {
  return osProcesses
    .map(process => ({
      pid: process.pid,
      parentPid: process.parentPid,
      kind: classifyProcess(process, rootPid),
      electronType: readProcessType(process.commandLine ?? ''),
      name: process.name,
      serviceName: null,
      workingSetBytes: process.workingSetBytes,
      privateBytes: process.privateBytes,
      source: 'os' as const,
    }))
    .sort((left, right) => left.pid - right.pid)
}

function metricValue(metrics: Array<{ name: string; value: number }>, name: string): number {
  return metrics.find(metric => metric.name === name)?.value ?? 0
}

async function collectRendererMetrics(page: Page): Promise<RendererMemorySample> {
  const session = await page.createCDPSession()
  try {
    await session.send('Performance.enable')
    await session.send('HeapProfiler.collectGarbage')
    const [performance, dom, heap] = await Promise.all([
      session.send('Performance.getMetrics') as Promise<{
        metrics: Array<{ name: string; value: number }>
      }>,
      session.send('Memory.getDOMCounters') as Promise<{
        documents: number
        nodes: number
        jsEventListeners: number
      }>,
      session.send('Runtime.getHeapUsage') as Promise<{
        usedSize: number
        embedderHeapUsedSize?: number
      }>,
    ])
    return {
      v8UsedHeapBytes: metricValue(performance.metrics, 'JSHeapUsedSize') || heap.usedSize,
      embedderHeapBytes:
        metricValue(performance.metrics, 'EmbedderHeapUsedSize') || heap.embedderHeapUsedSize || 0,
      domNodes: dom.nodes || metricValue(performance.metrics, 'Nodes'),
      documents: dom.documents || metricValue(performance.metrics, 'Documents'),
      eventListeners: dom.jsEventListeners || metricValue(performance.metrics, 'JSEventListeners'),
    }
  } finally {
    await session.detach()
  }
}

async function collectScenario(
  name: string,
  runtime: LaunchedRuntime,
  rendererBaseline?: ScenarioMetrics
): Promise<ScenarioMetrics> {
  const renderer = await collectRendererMetrics(runtime.page)
  const sampledProcesses = buildProcessSamples(
    runtime.child.pid!,
    await getOsProcessTree(runtime.child.pid!)
  )
  const processes = rendererBaseline
    ? identifyNewRendererProcessesAsWebviews(rendererBaseline.processes, sampledProcesses)
    : sampledProcesses
  const totals = aggregateProcessMemory(processes)
  const scenario = {
    ...totals,
    ...renderer,
    processes,
    capturedAt: new Date().toISOString(),
  }
  printScenario(name, scenario)
  return scenario
}

function printScenario(name: string, scenario: ScenarioMetrics): void {
  console.log(
    `${name}: total ${formatBytes(scenario.totalWorkingSetBytes)}, renderer ${formatBytes(scenario.rendererWorkingSetBytes)}, V8 ${formatBytes(scenario.v8UsedHeapBytes)}, embedder ${formatBytes(scenario.embedderHeapBytes)}, DOM ${scenario.domNodes} nodes/${scenario.documents} documents/${scenario.eventListeners} listeners`
  )
  for (const process of scenario.processes) {
    console.log(
      `  ${process.kind.padEnd(13)} pid=${String(process.pid).padEnd(7)} working=${formatBytes(process.workingSetBytes).padStart(10)} private=${process.privateBytes === null ? 'n/a' : formatBytes(process.privateBytes)} ${process.name ?? process.serviceName ?? ''}`
    )
  }
}

async function waitWithProgress(milliseconds: number, label: string): Promise<void> {
  if (milliseconds === 0) return
  const started = Date.now()
  while (Date.now() - started < milliseconds) {
    const remaining = milliseconds - (Date.now() - started)
    await new Promise(resolve => setTimeout(resolve, Math.min(60_000, remaining)))
    const elapsed = Math.min(milliseconds, Date.now() - started)
    console.log(`${label}: ${Math.round(elapsed / 1_000)}s/${Math.round(milliseconds / 1_000)}s`)
  }
}

async function navigate(page: Page, viewId: string): Promise<void> {
  await page.evaluate(nextViewId => {
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { viewId: nextViewId } }))
  }, viewId)
  await new Promise(resolve => setTimeout(resolve, 500))
}

async function closeNonDashboardTabs(page: Page): Promise<void> {
  await page.evaluate(() => {
    const dashboard = [...document.querySelectorAll<HTMLButtonElement>('.tab-select')].find(
      button => button.textContent?.trim() === 'Dashboard'
    )
    dashboard?.click()
  })
  while (
    await page.evaluate(() => {
      const closeButton = document.querySelector<HTMLButtonElement>(
        '.tab-close:not([aria-label="Close Dashboard"])'
      )
      closeButton?.click()
      return Boolean(closeButton)
    })
  ) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

async function runNavigationScenario(page: Page, cycles: number): Promise<void> {
  const views = ['settings-accounts', 'bookmarks-all', 'terminal-workspace', 'dashboard']
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const view of views) await navigate(page, view)
  }
  await closeNonDashboardTabs(page)
}

async function openTerminal(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('button[aria-label^="Toggle Terminal"]')?.click()
  )
  await page.waitForSelector('.terminal-panel', { visible: true })
  const automaticTerminal = await page
    .waitForSelector('.xterm', { visible: true, timeout: 30_000 })
    .catch(() => null)
  if (!automaticTerminal) {
    await page.evaluate(() =>
      document.querySelector<HTMLButtonElement>('button[aria-label="New Terminal"]')?.click()
    )
    await page.waitForSelector('.xterm', { visible: true, timeout: 30_000 })
  }
  const textarea = await page.$('.xterm-helper-textarea')
  if (textarea) {
    await textarea.focus()
    await page.keyboard.type('echo buddy-memory-probe')
    await page.keyboard.press('Enter')
  }
  await new Promise(resolve => setTimeout(resolve, 1_000))
}

async function closeTerminal(page: Page): Promise<void> {
  while (
    await page.evaluate(() => {
      const closeButton = document.querySelector<HTMLButtonElement>('.terminal-panel-tab-close')
      closeButton?.click()
      return Boolean(closeButton)
    })
  ) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  await new Promise(resolve => setTimeout(resolve, 1_000))
}

async function openBrowser(page: Page): Promise<void> {
  const route = `browser:${encodeURIComponent('https://example.com')}|${encodeURIComponent('Memory Probe')}`
  await navigate(page, route)
  await page.waitForSelector('webview', { timeout: 30_000 })
  await new Promise(resolve => setTimeout(resolve, 3_000))
}

async function closeActiveTab(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('.tab.active .tab-close')?.click()
  )
  await closeNonDashboardTabs(page)
}

function scaledBudgets(scale: number) {
  return {
    totalWorkingSetBytes: PACKAGED_MEMORY_BUDGETS.totalWorkingSetBytes * scale,
    rendererWorkingSetBytes: PACKAGED_MEMORY_BUDGETS.rendererWorkingSetBytes * scale,
    cleanupRatio: PACKAGED_MEMORY_BUDGETS.cleanupRatio,
  }
}

function collectFailures(
  mode: HarnessMode,
  scenarios: Record<string, ScenarioMetrics>,
  budgetScale: number
): BudgetFailure[] {
  if (mode === 'development') return []
  const budgets = scaledBudgets(budgetScale)
  const warm = scenarios['dashboard-warm']
  return [
    ...evaluateAbsoluteBudgets(warm, budgets),
    ...evaluateCleanupBudget(
      'navigation-cleanup',
      scenarios['navigation-baseline'],
      scenarios['navigation-cleanup']
    ),
    ...evaluateCleanupBudget(
      'terminal-cleanup',
      scenarios['terminal-baseline'],
      scenarios['terminal-cleanup']
    ),
    ...evaluateCleanupBudget(
      'browser-cleanup',
      scenarios['browser-baseline'],
      scenarios['browser-cleanup']
    ),
  ]
}

async function validateLaunch(
  runtime: LaunchedRuntime,
  profilePath: string
): Promise<RuntimeMetadata> {
  const configPath = path.join(profilePath, 'config.json')
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      await access(configPath)
      break
    } catch (_: unknown) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  try {
    await access(configPath)
  } catch (error: unknown) {
    throw new Error(`Electron did not initialize the isolated profile at ${profilePath}`, {
      cause: error,
    })
  }
  if (!runtime.electronVersion.startsWith('44.')) {
    throw new Error(`Expected Electron 44, found ${runtime.electronVersion}`)
  }
  return runtime
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<boolean> {
  if (child.exitCode !== null) return true
  return Promise.race([
    new Promise<boolean>(resolve => child.once('exit', () => resolve(true))),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs)),
  ])
}

async function closeRuntime(runtime: LaunchedRuntime): Promise<void> {
  await runtime.page
    .evaluate(() =>
      document.querySelector<HTMLButtonElement>('.window-control-button.close-button')?.click()
    )
    .catch(() => {})
  runtime.browser.disconnect()
  if (!(await waitForExit(runtime.child, 10_000))) {
    runtime.child.kill()
    await waitForExit(runtime.child, 5_000)
  }
}

async function runFreshProfile(
  run: number,
  options: HarnessOptions,
  executablePath: string | null
): Promise<HarnessRun> {
  const profilePath = await mkdtemp(path.join(tmpdir(), `buddy-memory-${randomUUID()}-`))
  let runtime: LaunchedRuntime | null = null
  try {
    if (!executablePath) throw new Error('No Electron executable was prepared')
    runtime = await launchRuntime(options, executablePath, profilePath)
    const page = runtime.page
    await page.waitForSelector('.activity-bar', { visible: true, timeout: 60_000 })
    const state = await validateLaunch(runtime, profilePath)
    console.log(`Run ${run}: Electron ${state.electronVersion}, profile ${profilePath}`)

    const scenarios: Record<string, ScenarioMetrics> = {}
    scenarios['dashboard-cold'] = await collectScenario('dashboard-cold', runtime)
    await waitWithProgress(options.warmupMs, 'dashboard idle warmup')
    scenarios['dashboard-warm'] = await collectScenario('dashboard-warm', runtime)

    await navigate(page, 'settings-accounts')
    await new Promise(resolve => setTimeout(resolve, options.settleMs))
    scenarios['settings-idle'] = await collectScenario('settings-idle', runtime)

    await closeNonDashboardTabs(page)
    await waitWithProgress(options.settleMs, 'navigation baseline')
    scenarios['navigation-baseline'] = await collectScenario('navigation-baseline', runtime)

    await runNavigationScenario(page, options.navigationCycles)
    await waitWithProgress(options.settleMs, 'navigation cleanup')
    scenarios['navigation-cleanup'] = await collectScenario('navigation-cleanup', runtime)

    await openTerminal(page)
    await closeTerminal(page)
    await waitWithProgress(options.settleMs, 'terminal baseline')
    scenarios['terminal-baseline'] = await collectScenario('terminal-baseline', runtime)

    await openTerminal(page)
    scenarios['terminal-open'] = await collectScenario('terminal-open', runtime)
    await closeTerminal(page)
    await waitWithProgress(options.settleMs, 'terminal cleanup')
    scenarios['terminal-cleanup'] = await collectScenario('terminal-cleanup', runtime)

    await openBrowser(page)
    await closeActiveTab(page)
    await waitWithProgress(options.settleMs, 'browser baseline')
    scenarios['browser-baseline'] = await collectScenario('browser-baseline', runtime)

    await openBrowser(page)
    scenarios['browser-open'] = await collectScenario(
      'browser-open',
      runtime,
      scenarios['browser-baseline']
    )
    await closeActiveTab(page)
    await waitWithProgress(options.settleMs, 'browser cleanup')
    scenarios['browser-cleanup'] = await collectScenario('browser-cleanup', runtime)

    const observedProcessKinds = [
      ...new Set(Object.values(scenarios).flatMap(scenario => scenario.processes.map(p => p.kind))),
    ].sort()
    return {
      run,
      mode: options.mode,
      electronVersion: state.electronVersion,
      appVersion: state.appVersion,
      profilePath,
      scenarios,
      failures: collectFailures(options.mode, scenarios, options.budgetScale),
      observedProcessKinds,
    }
  } finally {
    if (runtime) await closeRuntime(runtime)
    await rm(profilePath, { recursive: true, force: true })
  }
}

function buildMedians(runs: HarnessRun[]): HarnessResult['medians'] {
  const names = Object.keys(runs[0].scenarios)
  return Object.fromEntries(
    names.map(name => [name, buildMedianScenario(runs.map(run => run.scenarios[name]))])
  )
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${filePath}`)
}

async function recordBaseline(
  filePath: string,
  result: HarnessResult,
  firstRun: HarnessRun
): Promise<void> {
  await writeJson(filePath, {
    schema: 1,
    capturedAt: result.capturedAt,
    mode: firstRun.mode,
    platform: result.platform,
    architecture: result.architecture,
    electronVersion: firstRun.electronVersion,
    appVersion: firstRun.appVersion,
    runs: result.options.runs,
    warmupMs: result.options.warmupMs,
    budgets: result.budgets,
    medians: result.medians,
  })
}

function printFailures(failures: BudgetFailure[]): void {
  for (const failure of failures) {
    const isBytes = failure.metric.toLowerCase().includes('bytes')
    const actual = isBytes ? formatBytes(failure.actual) : failure.actual.toFixed(1)
    const limit = isBytes ? formatBytes(failure.limit) : failure.limit.toFixed(1)
    console.error(`${failure.scenario}: ${failure.metric} ${actual} exceeds ${limit}`)
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) {
    console.log(HELP)
    return
  }
  const executablePath = await prepareRuntime(options)
  const runs: HarnessRun[] = []
  for (let run = 1; run <= options.runs; run += 1) {
    runs.push(await runFreshProfile(run, options, executablePath))
  }
  const failures = runs.flatMap(run => run.failures)
  const result: HarnessResult = {
    schema: 1,
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    options,
    budgets: scaledBudgets(options.budgetScale),
    runs,
    medians: buildMedians(runs),
    failures,
    status:
      options.mode === 'development' ? 'informational' : failures.length === 0 ? 'pass' : 'fail',
  }
  if (options.outputPath) await writeJson(options.outputPath, result)
  if (options.recordBaselinePath) await recordBaseline(options.recordBaselinePath, result, runs[0])
  console.log(`Electron memory result: ${result.status}`)
  if (failures.length > 0) {
    printFailures(failures)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  })
}
