import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StartupTimer, STARTUP_SENTINEL, type StartupReport } from './startup-timing'

describe('StartupTimer', () => {
  describe('when disabled', () => {
    it('does not record marks', () => {
      const timer = new StartupTimer(false)
      timer.mark('app-ready')
      timer.mark('window-created')
      expect(timer.getReport()).toBeNull()
    })

    it('reports enabled as false', () => {
      const timer = new StartupTimer(false)
      expect(timer.enabled).toBe(false)
    })

    it('report() is a no-op', () => {
      const spy = vi.spyOn(console, 'log')
      const timer = new StartupTimer(false)
      timer.report()
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('when enabled', () => {
    let timer: StartupTimer

    beforeEach(() => {
      timer = new StartupTimer(true)
    })

    it('records marks with elapsed times', () => {
      timer.mark('app-ready')
      timer.mark('window-created')

      const report = timer.getReport()
      expect(report).not.toBeNull()
      expect(report!.marks).toHaveLength(3) // process-start + 2 marks
      expect(report!.marks[0].name).toBe('process-start')
      expect(report!.marks[1].name).toBe('app-ready')
      expect(report!.marks[2].name).toBe('window-created')
    })

    it('calculates phases between marks', () => {
      timer.mark('app-ready')
      timer.mark('content-loaded')

      const report = timer.getReport()!
      const phaseNames = Object.keys(report.phases)
      expect(phaseNames).toHaveLength(2)
      expect(phaseNames[0]).toBe('process-start → app-ready')
      expect(phaseNames[1]).toBe('app-ready → content-loaded')
    })

    it('reports totalStartupMs as last mark elapsed time', () => {
      timer.mark('app-ready')
      const report = timer.getReport()!
      expect(report.totalStartupMs).toBe(report.marks[1].elapsedFromStartMs)
    })

    it('returns null report when no marks added', () => {
      // Only has the initial process-start mark (length <= 1)
      expect(timer.getReport()).toBeNull()
    })

    it('reports enabled as true', () => {
      expect(timer.enabled).toBe(true)
    })
  })

  describe('report()', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('emits startup sentinel with JSON report', () => {
      const timer = new StartupTimer(true)
      timer.mark('app-ready')
      timer.report()

      const sentinelCall = consoleSpy.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].startsWith(STARTUP_SENTINEL)
      )
      expect(sentinelCall).toBeDefined()

      const json = sentinelCall![0].slice(STARTUP_SENTINEL.length)
      const parsed: StartupReport = JSON.parse(json)
      expect(parsed.marks).toHaveLength(2)
      expect(parsed.totalStartupMs).toBeGreaterThanOrEqual(0)
    })

    it('only reports once (idempotent)', () => {
      const timer = new StartupTimer(true)
      timer.mark('app-ready')
      timer.report()
      const callCount = consoleSpy.mock.calls.length
      timer.report()
      expect(consoleSpy.mock.calls.length).toBe(callCount)
      expect(timer.hasReported).toBe(true)
    })

    it('hasReported is false before report()', () => {
      const timer = new StartupTimer(true)
      timer.mark('app-ready')
      expect(timer.hasReported).toBe(false)
    })
  })

  describe('STARTUP_SENTINEL', () => {
    it('is a recognizable marker string', () => {
      expect(STARTUP_SENTINEL).toBe('::PERF_STARTUP_REPORT::')
    })
  })
})
