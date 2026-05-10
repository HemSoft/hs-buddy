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

vi.mock('@opentelemetry/api', () => {
  const setLogger = vi.fn()
  return {
    trace: { getTracer: vi.fn(() => ({ startActiveSpan: mockStartActiveSpan })) },
    metrics: {
      getMeter: vi.fn(() => ({
        createCounter: mockCreateCounter,
        createHistogram: mockCreateHistogram,
      })),
    },
    SpanStatusCode: { OK: 1, ERROR: 2 },
    diag: { setLogger },
    DiagConsoleLogger: vi.fn(),
    DiagLogLevel: { DEBUG: 0 },
  }
})

vi.mock('@opentelemetry/api-logs', () => ({
  logs: { getLogger: vi.fn(() => ({ emit: mockEmit })), setGlobalLoggerProvider: vi.fn() },
  SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
}))

// Mock all the dynamic import SDK packages for initTelemetry testing
vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: vi.fn(),
}))

vi.mock('@opentelemetry/exporter-metrics-otlp-proto', () => ({
  OTLPMetricExporter: vi.fn(),
}))

vi.mock('@opentelemetry/exporter-logs-otlp-proto', () => ({
  OTLPLogExporter: vi.fn(),
}))

vi.mock('@opentelemetry/sdk-metrics', () => ({
  PeriodicExportingMetricReader: vi.fn(),
}))

vi.mock('@opentelemetry/sdk-logs', () => ({
  BatchLogRecordProcessor: vi.fn(),
  LoggerProvider: vi.fn().mockImplementation(() => ({
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@opentelemetry/instrumentation-http', () => ({
  HttpInstrumentation: vi.fn(),
}))

vi.mock('@opentelemetry/instrumentation-dns', () => ({
  DnsInstrumentation: vi.fn(),
}))

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn(() => ({})),
}))

import {
  recordIpcCall,
  recordWindowOpen,
  emitLog,
  withSpan,
  initTelemetry,
  shutdownTelemetry,
} from './telemetry'

describe('telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initTelemetry', () => {
    it('is a no-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
      const orig = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      await initTelemetry()
      // No SDK was initialized — no metric handles created
      expect(mockCreateCounter).not.toHaveBeenCalled()
      if (orig !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = orig
      else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })

    it('initializes SDK when endpoint is set', async () => {
      const orig = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'
      delete process.env.OTEL_LOG_LEVEL
      // Should not throw when all SDK mocks are in place
      await expect(initTelemetry()).resolves.toBeUndefined()
      if (orig !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = orig
      else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })

    it('enables debug diagnostics when OTEL_LOG_LEVEL is debug', async () => {
      const { diag } = await import('@opentelemetry/api')
      const origEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      const origLogLevel = process.env.OTEL_LOG_LEVEL
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'
      process.env.OTEL_LOG_LEVEL = 'debug'
      await initTelemetry()
      expect(diag.setLogger).toHaveBeenCalled()
      if (origEndpoint !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = origEndpoint
      else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      if (origLogLevel !== undefined) process.env.OTEL_LOG_LEVEL = origLogLevel
      else delete process.env.OTEL_LOG_LEVEL
    })
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
})
