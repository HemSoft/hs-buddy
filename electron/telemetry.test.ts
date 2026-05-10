import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockSpan,
  mockStartActiveSpan,
  mockCreateCounter,
  mockCreateHistogram,
  mockEmit,
  mockSetLogger,
  mockSetGlobalLoggerProvider,
} = vi.hoisted(() => {
  const mockSpan = {
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  }
  const mockStartActiveSpan = vi.fn(
    (_name: unknown, _opts: unknown, fn: (s: typeof mockSpan) => unknown) => fn(mockSpan)
  )
  const mockCounter = { add: vi.fn() }
  const mockHistogram = { record: vi.fn() }
  const mockCreateCounter = vi.fn(() => mockCounter)
  const mockCreateHistogram = vi.fn(() => mockHistogram)
  const mockEmit = vi.fn()
  const mockSetLogger = vi.fn()
  const mockSetGlobalLoggerProvider = vi.fn()
  return {
    mockSpan,
    mockStartActiveSpan,
    mockCounter,
    mockHistogram,
    mockCreateCounter,
    mockCreateHistogram,
    mockEmit,
    mockSetLogger,
    mockSetGlobalLoggerProvider,
  }
})

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: vi.fn(() => ({ startActiveSpan: mockStartActiveSpan })) },
  metrics: {
    getMeter: vi.fn(() => ({
      createCounter: mockCreateCounter,
      createHistogram: mockCreateHistogram,
    })),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
  diag: { setLogger: mockSetLogger },
  DiagConsoleLogger: vi.fn(),
  DiagLogLevel: { DEBUG: 0 },
}))

vi.mock('@opentelemetry/api-logs', () => ({
  logs: {
    getLogger: vi.fn(() => ({ emit: mockEmit })),
    setGlobalLoggerProvider: mockSetGlobalLoggerProvider,
  },
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
      vi.resetModules()

      // Re-mock deps for fresh import
      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: { getMeter: vi.fn(() => ({ createCounter: vi.fn(), createHistogram: vi.fn() })) },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: { setLogger: vi.fn() },
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))

      const savedEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT

      const { initTelemetry } = await import('./telemetry')
      await expect(initTelemetry()).resolves.toBeUndefined()

      if (savedEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = savedEndpoint
    })

    it('initializes SDK when OTEL_EXPORTER_OTLP_ENDPOINT is set', async () => {
      vi.resetModules()

      const mockSdkStart = vi.fn()
      const mockSdkShutdown = vi.fn().mockResolvedValue(undefined)
      const mockLpShutdown = vi.fn().mockResolvedValue(undefined)

      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: {
          getMeter: vi.fn(() => ({
            createCounter: vi.fn(() => ({ add: vi.fn() })),
            createHistogram: vi.fn(() => ({ record: vi.fn() })),
          })),
        },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: { setLogger: vi.fn() },
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))
      vi.doMock('@opentelemetry/sdk-node', () => ({
        NodeSDK: vi.fn(function (this: Record<string, unknown>) {
          this.start = mockSdkStart
          this.shutdown = mockSdkShutdown
        }),
      }))
      vi.doMock('@opentelemetry/exporter-trace-otlp-proto', () => ({
        OTLPTraceExporter: vi.fn(),
      }))
      vi.doMock('@opentelemetry/exporter-metrics-otlp-proto', () => ({
        OTLPMetricExporter: vi.fn(),
      }))
      vi.doMock('@opentelemetry/exporter-logs-otlp-proto', () => ({
        OTLPLogExporter: vi.fn(),
      }))
      vi.doMock('@opentelemetry/sdk-metrics', () => ({
        PeriodicExportingMetricReader: vi.fn(),
      }))
      vi.doMock('@opentelemetry/sdk-logs', () => ({
        BatchLogRecordProcessor: vi.fn(),
        LoggerProvider: vi.fn(function (this: Record<string, unknown>) {
          this.shutdown = mockLpShutdown
        }),
      }))
      vi.doMock('@opentelemetry/instrumentation-http', () => ({
        HttpInstrumentation: vi.fn(),
      }))
      vi.doMock('@opentelemetry/instrumentation-dns', () => ({
        DnsInstrumentation: vi.fn(),
      }))
      vi.doMock('@opentelemetry/resources', () => ({
        resourceFromAttributes: vi.fn(),
      }))

      const savedEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'

      const { initTelemetry, shutdownTelemetry: shutdown } = await import('./telemetry')
      await initTelemetry()

      expect(mockSdkStart).toHaveBeenCalled()

      // Second call should be idempotent
      await initTelemetry()
      expect(mockSdkStart).toHaveBeenCalledTimes(1)

      // Shutdown should call both providers
      await shutdown()
      expect(mockLpShutdown).toHaveBeenCalled()
      expect(mockSdkShutdown).toHaveBeenCalled()

      if (savedEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = savedEndpoint
      else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })

    it('enables debug diagnostics when OTEL_LOG_LEVEL=debug', async () => {
      vi.resetModules()

      const mockDiagSetLogger = vi.fn()

      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: {
          getMeter: vi.fn(() => ({
            createCounter: vi.fn(() => ({ add: vi.fn() })),
            createHistogram: vi.fn(() => ({ record: vi.fn() })),
          })),
        },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: { setLogger: mockDiagSetLogger },
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))
      vi.doMock('@opentelemetry/sdk-node', () => ({
        NodeSDK: vi.fn(function (this: Record<string, unknown>) {
          this.start = vi.fn()
          this.shutdown = vi.fn()
        }),
      }))
      vi.doMock('@opentelemetry/exporter-trace-otlp-proto', () => ({ OTLPTraceExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-metrics-otlp-proto', () => ({
        OTLPMetricExporter: vi.fn(),
      }))
      vi.doMock('@opentelemetry/exporter-logs-otlp-proto', () => ({ OTLPLogExporter: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-metrics', () => ({
        PeriodicExportingMetricReader: vi.fn(),
      }))
      vi.doMock('@opentelemetry/sdk-logs', () => ({
        BatchLogRecordProcessor: vi.fn(),
        LoggerProvider: vi.fn(function (this: Record<string, unknown>) {
          this.shutdown = vi.fn()
        }),
      }))
      vi.doMock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/instrumentation-dns', () => ({ DnsInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/resources', () => ({ resourceFromAttributes: vi.fn() }))

      const savedEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      const savedLogLevel = process.env.OTEL_LOG_LEVEL
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'
      process.env.OTEL_LOG_LEVEL = 'debug'

      const { initTelemetry } = await import('./telemetry')
      await initTelemetry()

      expect(mockDiagSetLogger).toHaveBeenCalled()

      if (savedEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = savedEndpoint
      else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      if (savedLogLevel) process.env.OTEL_LOG_LEVEL = savedLogLevel
      else delete process.env.OTEL_LOG_LEVEL
    })

    it('handles SDK import failure gracefully', async () => {
      vi.resetModules()

      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: { getMeter: vi.fn(() => ({ createCounter: vi.fn(), createHistogram: vi.fn() })) },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: { setLogger: vi.fn() },
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))
      // Make SDK import fail
      vi.doMock('@opentelemetry/sdk-node', () => {
        throw new Error('Module not found')
      })

      const savedEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'

      const { initTelemetry } = await import('./telemetry')
      // Should not throw — failure is non-fatal
      await expect(initTelemetry()).resolves.toBeUndefined()

      if (savedEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = savedEndpoint
      else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })

    it('recordIpcCall and recordWindowOpen work after initMetricHandles', async () => {
      vi.resetModules()

      const mockAdd = vi.fn()
      const mockRecord = vi.fn()

      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: {
          getMeter: vi.fn(() => ({
            createCounter: vi.fn(() => ({ add: mockAdd })),
            createHistogram: vi.fn(() => ({ record: mockRecord })),
          })),
        },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: { setLogger: vi.fn() },
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))
      vi.doMock('@opentelemetry/sdk-node', () => ({
        NodeSDK: vi.fn(function (this: Record<string, unknown>) {
          this.start = vi.fn()
          this.shutdown = vi.fn()
        }),
      }))
      vi.doMock('@opentelemetry/exporter-trace-otlp-proto', () => ({ OTLPTraceExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-metrics-otlp-proto', () => ({
        OTLPMetricExporter: vi.fn(),
      }))
      vi.doMock('@opentelemetry/exporter-logs-otlp-proto', () => ({ OTLPLogExporter: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-metrics', () => ({
        PeriodicExportingMetricReader: vi.fn(),
      }))
      vi.doMock('@opentelemetry/sdk-logs', () => ({
        BatchLogRecordProcessor: vi.fn(),
        LoggerProvider: vi.fn(function (this: Record<string, unknown>) {
          this.shutdown = vi.fn()
        }),
      }))
      vi.doMock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/instrumentation-dns', () => ({ DnsInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/resources', () => ({ resourceFromAttributes: vi.fn() }))

      const savedEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'

      const {
        initTelemetry,
        recordIpcCall: recIpc,
        recordWindowOpen: recWin,
      } = await import('./telemetry')
      await initTelemetry()

      recIpc('test:chan', 50)
      expect(mockAdd).toHaveBeenCalledWith(1, { 'ipc.channel': 'test:chan' })
      expect(mockRecord).toHaveBeenCalledWith(50, { 'ipc.channel': 'test:chan' })

      recIpc('test:error', 100, true)
      // error counter: 2 calls to add (one for call counter, one for error counter)
      expect(mockAdd).toHaveBeenCalledWith(1, { 'ipc.channel': 'test:error' })

      recWin('main-window')
      expect(mockAdd).toHaveBeenCalledWith(1, { 'window.target': 'main-window' })

      if (savedEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = savedEndpoint
      else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })

    it('shutdownTelemetry handles provider shutdown error', async () => {
      vi.resetModules()

      const mockLpShutdown = vi.fn().mockRejectedValue(new Error('shutdown failed'))

      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: {
          getMeter: vi.fn(() => ({
            createCounter: vi.fn(() => ({ add: vi.fn() })),
            createHistogram: vi.fn(() => ({ record: vi.fn() })),
          })),
        },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: { setLogger: vi.fn() },
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))
      vi.doMock('@opentelemetry/sdk-node', () => ({
        NodeSDK: vi.fn(function (this: Record<string, unknown>) {
          this.start = vi.fn()
          this.shutdown = vi.fn()
        }),
      }))
      vi.doMock('@opentelemetry/exporter-trace-otlp-proto', () => ({ OTLPTraceExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-metrics-otlp-proto', () => ({
        OTLPMetricExporter: vi.fn(),
      }))
      vi.doMock('@opentelemetry/exporter-logs-otlp-proto', () => ({ OTLPLogExporter: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-metrics', () => ({
        PeriodicExportingMetricReader: vi.fn(),
      }))
      vi.doMock('@opentelemetry/sdk-logs', () => ({
        BatchLogRecordProcessor: vi.fn(),
        LoggerProvider: vi.fn(function (this: Record<string, unknown>) {
          this.shutdown = mockLpShutdown
        }),
      }))
      vi.doMock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/instrumentation-dns', () => ({ DnsInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/resources', () => ({ resourceFromAttributes: vi.fn() }))

      const savedEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'

      const { initTelemetry, shutdownTelemetry: shutdown } = await import('./telemetry')
      await initTelemetry()

      // Should not throw despite provider error
      await expect(shutdown()).resolves.toBeUndefined()

      if (savedEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = savedEndpoint
      else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })
  })
})
