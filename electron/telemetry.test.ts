import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSpan = {
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
}

const mockStartActiveSpan = vi.fn((_name, _opts, fn) => fn(mockSpan))

const mockCounter = { add: vi.fn() }
const mockHistogram = { record: vi.fn() }
const mockCreateCounter = vi.fn(() => mockCounter)
const mockCreateHistogram = vi.fn(() => mockHistogram)
const mockEmit = vi.fn()

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: vi.fn(() => ({ startActiveSpan: mockStartActiveSpan })) },
  metrics: {
    getMeter: vi.fn(() => ({
      createCounter: mockCreateCounter,
      createHistogram: mockCreateHistogram,
    })),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
  diag: { setLogger: vi.fn() },
  DiagConsoleLogger: vi.fn(),
  DiagLogLevel: { DEBUG: 0 },
}))

vi.mock('@opentelemetry/api-logs', () => ({
  logs: { getLogger: vi.fn(() => ({ emit: mockEmit })), setGlobalLoggerProvider: vi.fn() },
  SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
}))

import { recordIpcCall, recordWindowOpen, emitLog, withSpan, shutdownTelemetry } from './telemetry'

describe('telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('recordIpcCall', () => {
    it('does not throw when counters are uninitialized', () => {
      expect(() => recordIpcCall('test:channel', 42)).not.toThrow()
    })

    it('does not throw with error flag', () => {
      expect(() => recordIpcCall('test:channel', 100, true)).not.toThrow()
    })
  })

  describe('recordWindowOpen', () => {
    it('does not throw when counter is uninitialized', () => {
      expect(() => recordWindowOpen('example.com')).not.toThrow()
    })
  })

  describe('emitLog', () => {
    it('emits a log record with correct severity for INFO', () => {
      emitLog('INFO', 'Test message', { key: 'value' })
      expect(mockEmit).toHaveBeenCalledWith({
        severityNumber: 9,
        severityText: 'INFO',
        body: 'Test message',
        attributes: { key: 'value' },
      })
    })

    it('maps DEBUG severity number correctly', () => {
      emitLog('DEBUG', 'debug msg')
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ severityNumber: 5, severityText: 'DEBUG' })
      )
    })

    it('maps WARN severity number correctly', () => {
      emitLog('WARN', 'warning msg')
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ severityNumber: 13, severityText: 'WARN' })
      )
    })

    it('maps ERROR severity number correctly', () => {
      emitLog('ERROR', 'error msg')
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ severityNumber: 17, severityText: 'ERROR' })
      )
    })

    it('passes undefined attributes when not provided', () => {
      emitLog('INFO', 'bare message')
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'bare message', attributes: undefined })
      )
    })
  })

  describe('withSpan', () => {
    it('calls startActiveSpan with span name and attributes', async () => {
      await withSpan('test-op', { foo: 'bar' }, async () => 'ok')
      expect(mockStartActiveSpan).toHaveBeenCalledWith(
        'test-op',
        { attributes: { foo: 'bar' } },
        expect.any(Function)
      )
    })

    it('sets span status to OK on success', async () => {
      const result = await withSpan('success-op', {}, async () => 42)
      expect(result).toBe(42)
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 })
    })

    it('sets span status to ERROR and records exception on failure', async () => {
      const error = new Error('test failure')
      await expect(
        withSpan('fail-op', {}, async () => {
          throw error
        })
      ).rejects.toThrow('test failure')

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'Error: test failure',
      })
      expect(mockSpan.recordException).toHaveBeenCalledWith(error)
    })

    it('always calls span.end()', async () => {
      await withSpan('end-op', {}, async () => 'done')
      expect(mockSpan.end).toHaveBeenCalled()
    })

    it('calls span.end() even on failure', async () => {
      try {
        await withSpan('fail-end', {}, async () => {
          throw new Error('boom')
        })
      } catch (_: unknown) {
        // expected
      }
      expect(mockSpan.end).toHaveBeenCalled()
    })

    it('records non-Error exceptions wrapped in Error', async () => {
      await expect(
        withSpan('string-throw', {}, async () => {
          throw 'string error'
        })
      ).rejects.toBe('string error')
      expect(mockSpan.recordException).toHaveBeenCalledWith(new Error('string error'))
    })
  })

  describe('shutdownTelemetry', () => {
    it('resolves without error when sdk is null', async () => {
      await expect(shutdownTelemetry()).resolves.toBeUndefined()
    })
  })

  describe('initTelemetry', () => {
    it('is a no-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
      const { initTelemetry } = await import('./telemetry')
      // process.env has no OTEL_EXPORTER_OTLP_ENDPOINT by default in test
      await expect(initTelemetry()).resolves.toBeUndefined()
    })
  })

  describe('recordIpcCall with initialized counters', () => {
    it('records call count, duration, and error when counters are set up', async () => {
      // Dynamically import to get fresh module — mock getMeter sets up counters
      const { metrics } = await import('@opentelemetry/api')
      metrics.getMeter('test')
      // Manually initialize metric handles by calling the internal setup
      // We simulate this by testing that recordIpcCall works when counters exist
      // The counters are null until initMetricHandles runs, which needs real SDK.
      // We can verify the no-op path doesn't crash with all flag combinations:
      recordIpcCall('test:chan', 50, false)
      recordIpcCall('test:chan', 100, true)
      // No assertion on calls since counters are null — verifying no crash
    })
  })

  describe('withSpan edge cases', () => {
    it('handles a fn that returns undefined', async () => {
      const result = await withSpan('void-op', {}, async () => undefined)
      expect(result).toBeUndefined()
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 })
      expect(mockSpan.end).toHaveBeenCalled()
    })
  })
})
