/**
 * Electron Startup Timing — Opt-in Diagnostic Instrumentation
 *
 * Measures time from process start through Electron startup phases:
 *   1. Module load (process start → this module executes)
 *   2. app.whenReady() (Electron ready event)
 *   3. Window creation (BrowserWindow instantiation)
 *   4. Content loaded (did-finish-load event)
 *
 * Usage:
 *   Set PERF_STARTUP=1 environment variable before launching Electron.
 *   Results are logged to stdout and optionally written to a JSON file.
 *
 * Integration:
 *   import { startupTimer } from '../perf/startup-timing'
 *   // After app.whenReady():
 *   startupTimer.mark('app-ready')
 *   // After createWindow():
 *   startupTimer.mark('window-created')
 *   // In did-finish-load handler:
 *   startupTimer.mark('content-loaded')
 *   startupTimer.report()
 */

export interface TimingMark {
  name: string
  timestampMs: number
  elapsedFromStartMs: number
}

export interface StartupReport {
  processStartMs: number
  marks: TimingMark[]
  totalStartupMs: number
  phases: Record<string, number>
}

const ENABLED = process.env.PERF_STARTUP === '1'

/** Structured sentinel emitted to stdout for machine-readable parsing. */
export const STARTUP_SENTINEL = '::PERF_STARTUP_REPORT::'

export class StartupTimer {
  private readonly processStartMs: number
  private readonly marks: TimingMark[] = []
  private reported = false

  constructor(private readonly isEnabled = ENABLED) {
    // process.uptime() gives seconds since Node process started
    this.processStartMs = Date.now() - process.uptime() * 1000
    if (this.isEnabled) {
      this.marks.push({
        name: 'process-start',
        timestampMs: this.processStartMs,
        elapsedFromStartMs: 0,
      })
    }
  }

  /** Record a named timing mark. */
  mark(name: string): void {
    if (!this.isEnabled) return
    const now = Date.now()
    this.marks.push({
      name,
      timestampMs: now,
      elapsedFromStartMs: now - this.processStartMs,
    })
  }

  /** Generate the full startup report. */
  getReport(): StartupReport | null {
    if (!this.isEnabled || this.marks.length <= 1) return null

    const phases: Record<string, number> = {}
    for (let i = 1; i < this.marks.length; i++) {
      const phaseName = `${this.marks[i - 1].name} → ${this.marks[i].name}`
      phases[phaseName] = this.marks[i].elapsedFromStartMs - this.marks[i - 1].elapsedFromStartMs
    }

    const lastMark = this.marks[this.marks.length - 1]
    return {
      processStartMs: this.processStartMs,
      marks: [...this.marks],
      totalStartupMs: lastMark.elapsedFromStartMs,
      phases,
    }
  }

  /**
   * Log the report to stdout (once only — repeated calls are no-ops).
   * Emits a structured sentinel line for machine-readable parsing.
   * @param targetMs - Target startup time in milliseconds (default: from PERF_STARTUP_TARGET_MS env or 3000)
   */
  report(targetMs?: number): void {
    if (this.reported) return
    const report = this.getReport()
    if (!report) return
    this.reported = true

    const DEFAULT_TARGET_MS = 3000
    const envTarget = Number(process.env.PERF_STARTUP_TARGET_MS)
    const target =
      targetMs ?? (Number.isFinite(envTarget) && envTarget > 0 ? envTarget : DEFAULT_TARGET_MS)

    console.log('\n⏱️  Startup Performance Report')
    console.log('─'.repeat(50))
    for (const mark of report.marks) {
      console.log(`  ${mark.name.padEnd(20)} ${mark.elapsedFromStartMs.toFixed(0)}ms`)
    }
    console.log('─'.repeat(50))
    for (const [phase, duration] of Object.entries(report.phases)) {
      console.log(`  ${phase}: ${duration.toFixed(0)}ms`)
    }
    console.log('─'.repeat(50))
    console.log(`  Total: ${report.totalStartupMs.toFixed(0)}ms`)

    if (report.totalStartupMs > target) {
      console.log(
        `  ⚠️  Exceeds ${target}ms target by ${(report.totalStartupMs - target).toFixed(0)}ms`
      )
    } else {
      console.log(`  ✅ Within ${target}ms target`)
    }

    // Machine-readable sentinel for perf:startup runner
    console.log(`${STARTUP_SENTINEL}${JSON.stringify(report)}`)
    console.log('')
  }

  /** Write report to a JSON file. */
  async writeToFile(filepath: string): Promise<void> {
    const report = this.getReport()
    if (!report) return
    const { writeFileSync } = await import('node:fs')
    writeFileSync(filepath, JSON.stringify(report, null, 2) + '\n')
  }

  /** Check if startup timing is enabled. */
  get enabled(): boolean {
    return this.isEnabled
  }

  /** Whether the report has already been emitted. */
  get hasReported(): boolean {
    return this.reported
  }
}

/** Singleton startup timer instance. */
export const startupTimer = new StartupTimer()
