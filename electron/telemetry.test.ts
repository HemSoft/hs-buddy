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

    it('falls back to INFO severity for unknown severity levels', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitLog('TRACE' as any, 'trace msg')
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ severityNumber: 9, severityText: 'TRACE' })
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
    it('logs disabled message when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      const { initTelemetry: initFresh } = await import('./telemetry')
      await initFresh()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('telemetry disabled'))
      consoleSpy.mockRestore()
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint
    })

    it('initializes SDK when OTEL_EXPORTER_OTLP_ENDPOINT is set', async () => {
      vi.resetModules()

      const mockNodeSDK = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) }
      const mockLoggerProvider = { shutdown: vi.fn().mockResolvedValue(undefined) }
      const mockMeter = {
        createCounter: vi.fn(() => ({ add: vi.fn() })),
        createHistogram: vi.fn(() => ({ record: vi.fn() })),
      }

      // Re-mock with fresh module state
      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: { getMeter: vi.fn(() => mockMeter) },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: { setLogger: vi.fn() },
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))
      function MockNodeSDK() { return mockNodeSDK }
      function MockLoggerProvider() { return mockLoggerProvider }

      vi.doMock('@opentelemetry/sdk-node', () => ({ NodeSDK: MockNodeSDK }))
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
        LoggerProvider: MockLoggerProvider,
      }))
      vi.doMock('@opentelemetry/instrumentation-http', () => ({
        HttpInstrumentation: vi.fn(),
      }))
      vi.doMock('@opentelemetry/instrumentation-dns', () => ({
        DnsInstrumentation: vi.fn(),
      }))
      vi.doMock('@opentelemetry/resources', () => ({
        resourceFromAttributes: vi.fn(() => ({})),
      }))

      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { initTelemetry: initEnabled } = await import('./telemetry')
      await initEnabled()

      expect(mockNodeSDK.start).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Initialized'))
      consoleSpy.mockRestore()
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })

    it('handles SDK import failure gracefully', async () => {
      vi.resetModules()

      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: { getMeter: vi.fn() },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: { setLogger: vi.fn() },
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))
      // Make the SDK import throw
      vi.doMock('@opentelemetry/sdk-node', () => {
        throw new Error('SDK not found')
      })

      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318'
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { initTelemetry: initFail } = await import('./telemetry')
      await initFail()

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load SDK'),
        expect.anything()
      )
      warnSpy.mockRestore()
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })

    it('enables debug diagnostics when OTEL_LOG_LEVEL=debug', async () => {
      vi.resetModules()

      const mockDiag = { setLogger: vi.fn() }
      const mockNodeSDK = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) }
      const mockLoggerProvider = { shutdown: vi.fn().mockResolvedValue(undefined) }

      // Use regular functions for constructors (arrow functions can't be used with `new`)
      function MockNodeSDK2() { return mockNodeSDK }
      function MockLoggerProvider2() { return mockLoggerProvider }

      vi.doMock('@opentelemetry/api', () => ({
        trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
        metrics: {
          getMeter: vi.fn(() => ({
            createCounter: vi.fn(() => ({ add: vi.fn() })),
            createHistogram: vi.fn(() => ({ record: vi.fn() })),
          })),
        },
        SpanStatusCode: { OK: 1, ERROR: 2 },
        diag: mockDiag,
        DiagConsoleLogger: vi.fn(),
        DiagLogLevel: { DEBUG: 0 },
      }))
      vi.doMock('@opentelemetry/api-logs', () => ({
        logs: { getLogger: vi.fn(() => ({ emit: vi.fn() })), setGlobalLoggerProvider: vi.fn() },
        SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
      }))
      vi.doMock('@opentelemetry/sdk-node', () => ({ NodeSDK: MockNodeSDK2 }))
      vi.doMock('@opentelemetry/exporter-trace-otlp-proto', () => ({ OTLPTraceExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-metrics-otlp-proto', () => ({ OTLPMetricExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-logs-otlp-proto', () => ({ OTLPLogExporter: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-metrics', () => ({ PeriodicExportingMetricReader: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-logs', () => ({
        BatchLogRecordProcessor: vi.fn(),
        LoggerProvider: MockLoggerProvider2,
      }))
      vi.doMock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/instrumentation-dns', () => ({ DnsInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/resources', () => ({ resourceFromAttributes: vi.fn(() => ({})) }))

      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318'
      process.env.OTEL_LOG_LEVEL = 'debug'
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const { initTelemetry: initDebug } = await import('./telemetry')
      await initDebug()

      expect(mockDiag.setLogger).toHaveBeenCalled()
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      delete process.env.OTEL_LOG_LEVEL
    })
  })

  describe('shutdownTelemetry - with active SDK', () => {
    it('calls shutdown on loggerProvider and sdk', async () => {
      vi.resetModules()

      const mockNodeSDK = { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) }
      const mockLoggerProvider = { shutdown: vi.fn().mockResolvedValue(undefined) }

      function MockNodeSDK3() { return mockNodeSDK }
      function MockLoggerProvider3() { return mockLoggerProvider }

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
      vi.doMock('@opentelemetry/sdk-node', () => ({ NodeSDK: MockNodeSDK3 }))
      vi.doMock('@opentelemetry/exporter-trace-otlp-proto', () => ({ OTLPTraceExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-metrics-otlp-proto', () => ({ OTLPMetricExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-logs-otlp-proto', () => ({ OTLPLogExporter: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-metrics', () => ({ PeriodicExportingMetricReader: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-logs', () => ({
        BatchLogRecordProcessor: vi.fn(),
        LoggerProvider: MockLoggerProvider3,
      }))
      vi.doMock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/instrumentation-dns', () => ({ DnsInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/resources', () => ({ resourceFromAttributes: vi.fn(() => ({})) }))

      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318'
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const mod = await import('./telemetry')
      await mod.initTelemetry()
      await mod.shutdownTelemetry()

      expect(mockLoggerProvider.shutdown).toHaveBeenCalled()
      expect(mockNodeSDK.shutdown).toHaveBeenCalled()
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })

    it('catches shutdown errors without throwing', async () => {
      vi.resetModules()

      const mockNodeSDK = {
        start: vi.fn(),
        shutdown: vi.fn().mockRejectedValue(new Error('shutdown fail')),
      }
      const mockLoggerProvider = {
        shutdown: vi.fn().mockRejectedValue(new Error('logger shutdown fail')),
      }

      function MockNodeSDK4() { return mockNodeSDK }
      function MockLoggerProvider4() { return mockLoggerProvider }

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
      vi.doMock('@opentelemetry/sdk-node', () => ({ NodeSDK: MockNodeSDK4 }))
      vi.doMock('@opentelemetry/exporter-trace-otlp-proto', () => ({ OTLPTraceExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-metrics-otlp-proto', () => ({ OTLPMetricExporter: vi.fn() }))
      vi.doMock('@opentelemetry/exporter-logs-otlp-proto', () => ({ OTLPLogExporter: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-metrics', () => ({ PeriodicExportingMetricReader: vi.fn() }))
      vi.doMock('@opentelemetry/sdk-logs', () => ({
        BatchLogRecordProcessor: vi.fn(),
        LoggerProvider: MockLoggerProvider4,
      }))
      vi.doMock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/instrumentation-dns', () => ({ DnsInstrumentation: vi.fn() }))
      vi.doMock('@opentelemetry/resources', () => ({ resourceFromAttributes: vi.fn(() => ({})) }))

      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318'
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const mod = await import('./telemetry')
      await mod.initTelemetry()
      await mod.shutdownTelemetry()

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Shutdown error'), expect.anything())
      warnSpy.mockRestore()
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })
  })
})
