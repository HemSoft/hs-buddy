import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

const dynamicOtelModules = [
  '@opentelemetry/sdk-node',
  '@opentelemetry/exporter-trace-otlp-proto',
  '@opentelemetry/exporter-metrics-otlp-proto',
  '@opentelemetry/exporter-logs-otlp-proto',
  '@opentelemetry/sdk-metrics',
  '@opentelemetry/sdk-logs',
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-dns',
  '@opentelemetry/resources',
]

const originalTelemetryEnv = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
  OTEL_LOG_LEVEL: process.env.OTEL_LOG_LEVEL,
  npm_package_version: process.env.npm_package_version,
}

function restoreTelemetryTestState(): void {
  vi.restoreAllMocks()
  vi.resetModules()

  for (const [key, value] of Object.entries(originalTelemetryEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  for (const moduleName of dynamicOtelModules) {
    vi.doUnmock(moduleName)
  }
}

function mockTelemetrySdk(
  options: {
    sdkNodeError?: Error
    sdkShutdown?: ReturnType<typeof vi.fn>
    loggerShutdown?: ReturnType<typeof vi.fn>
  } = {}
) {
  const mockSdkStart = vi.fn()
  const mockSdkShutdown = options.sdkShutdown ?? vi.fn().mockResolvedValue(undefined)
  const mockLoggerProviderShutdown = options.loggerShutdown ?? vi.fn().mockResolvedValue(undefined)
  const MockNodeSDK = vi.fn(function MockNodeSDK() {
    return { start: mockSdkStart, shutdown: mockSdkShutdown }
  })
  const mockResourceFromAttributes = vi.fn((attributes: Record<string, string>) => attributes)
  const MockLoggerProvider = vi.fn(function MockLoggerProvider() {
    return { shutdown: mockLoggerProviderShutdown }
  })

  if (options.sdkNodeError) {
    vi.doMock('@opentelemetry/sdk-node', () => {
      throw options.sdkNodeError
    })
  } else {
    vi.doMock('@opentelemetry/sdk-node', () => ({
      NodeSDK: MockNodeSDK,
    }))
  }

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
    resourceFromAttributes: mockResourceFromAttributes,
  }))

  return {
    MockNodeSDK,
    MockLoggerProvider,
    mockLoggerProviderShutdown,
    mockResourceFromAttributes,
    mockSdkShutdown,
    mockSdkStart,
  }
}

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

  describe('initTelemetry', () => {
    afterEach(() => {
      restoreTelemetryTestState()
    })

    it('does nothing when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
      vi.resetModules()
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initTelemetry } = await import('./telemetry')

      await initTelemetry()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('telemetry disabled'))
    })

    it('initializes SDK, metric handles, and default config when endpoint is set', async () => {
      vi.resetModules()
      const { mockResourceFromAttributes, mockSdkStart } = mockTelemetrySdk()
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'
      delete process.env.OTEL_SERVICE_NAME
      delete process.env.OTEL_LOG_LEVEL
      delete process.env.npm_package_version

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initTelemetry, recordIpcCall, recordWindowOpen } = await import('./telemetry')
      const { metrics } = await import('@opentelemetry/api')

      await initTelemetry()

      expect(mockSdkStart).toHaveBeenCalledTimes(1)
      expect(mockResourceFromAttributes).toHaveBeenCalledWith({
        'service.name': 'buddy',
        'service.version': '0.0.0',
      })
      expect(metrics.getMeter).toHaveBeenCalledWith('buddy', '0.0.0')
      expect(mockCreateCounter).toHaveBeenCalledTimes(3)
      expect(mockCreateHistogram).toHaveBeenCalledTimes(1)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Initialized'))

      mockCounter.add.mockClear()
      mockHistogram.record.mockClear()

      recordIpcCall('test:channel', 42, true)
      recordWindowOpen('settings')

      expect(mockCounter.add).toHaveBeenCalledTimes(3)
      expect(mockCounter.add).toHaveBeenNthCalledWith(1, 1, { 'ipc.channel': 'test:channel' })
      expect(mockHistogram.record).toHaveBeenCalledWith(42, { 'ipc.channel': 'test:channel' })
      expect(mockCounter.add).toHaveBeenNthCalledWith(2, 1, { 'ipc.channel': 'test:channel' })
      expect(mockCounter.add).toHaveBeenNthCalledWith(3, 1, { 'window.target': 'settings' })
    })

    it('enables debug diagnostics when OTEL_LOG_LEVEL is debug', async () => {
      vi.resetModules()
      mockTelemetrySdk()
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'
      process.env.OTEL_LOG_LEVEL = 'debug'

      vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initTelemetry } = await import('./telemetry')
      const { diag, DiagConsoleLogger, DiagLogLevel } = await import('@opentelemetry/api')

      await initTelemetry()

      expect(DiagConsoleLogger).toHaveBeenCalledTimes(1)
      expect(diag.setLogger).toHaveBeenCalledWith(expect.any(Object), DiagLogLevel.DEBUG)
    })

    it('is a no-op when called twice', async () => {
      vi.resetModules()
      const { MockNodeSDK, mockSdkStart } = mockTelemetrySdk()
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'

      vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initTelemetry } = await import('./telemetry')

      await initTelemetry()
      await initTelemetry()

      expect(MockNodeSDK).toHaveBeenCalledTimes(1)
      expect(mockSdkStart).toHaveBeenCalledTimes(1)
    })

    it('handles SDK import failure gracefully', async () => {
      vi.resetModules()
      mockTelemetrySdk({ sdkNodeError: new Error('Module not found') })
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { initTelemetry } = await import('./telemetry')

      await initTelemetry()

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load SDK packages'),
        expect.any(Error)
      )
    })
  })

  describe('shutdownTelemetry', () => {
    afterEach(() => {
      restoreTelemetryTestState()
    })

    it('resolves without error when sdk is null', async () => {
      await expect(shutdownTelemetry()).resolves.toBeUndefined()
    })

    it('shuts down active providers without error', async () => {
      vi.resetModules()
      const { mockLoggerProviderShutdown, mockSdkShutdown } = mockTelemetrySdk()
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'

      vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initTelemetry, shutdownTelemetry } = await import('./telemetry')

      await initTelemetry()
      await shutdownTelemetry()

      expect(mockLoggerProviderShutdown).toHaveBeenCalledTimes(1)
      expect(mockSdkShutdown).toHaveBeenCalledTimes(1)
    })

    it('catches shutdown errors without throwing', async () => {
      vi.resetModules()
      const mockSdkShutdown = vi.fn().mockRejectedValue(new Error('shutdown failed'))
      mockTelemetrySdk({ sdkShutdown: mockSdkShutdown })
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317'

      vi.spyOn(console, 'log').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { initTelemetry, shutdownTelemetry } = await import('./telemetry')

      await initTelemetry()

      await expect(shutdownTelemetry()).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith('[Telemetry] Shutdown error:', expect.any(Error))
    })
  })
})
