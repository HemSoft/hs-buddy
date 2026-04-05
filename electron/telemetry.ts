/**
 * OpenTelemetry instrumentation for the Electron main process.
 * Exports structured logs, traces (spans), and metrics to the Aspire
 * dashboard via OTLP/proto when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 *
 * Call `initTelemetry()` before any other imports that use HTTP/DNS
 * so the auto-instrumentations can patch them.
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import {
  trace,
  metrics,
  type Span,
  SpanStatusCode,
  type Meter,
  type Counter,
  type Histogram,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
} from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let sdk: NodeSDK | null = null
let loggerProvider: LoggerProvider | null = null
let meter: Meter | null = null

// Metrics handles (lazy-initialized)
let ipcCallCounter: Counter | null = null
let ipcDurationHistogram: Histogram | null = null
let ipcErrorCounter: Counter | null = null
let windowOpenCounter: Counter | null = null

// ---------------------------------------------------------------------------
// Init / Shutdown
// ---------------------------------------------------------------------------

/**
 * Initialize OpenTelemetry if OTEL_EXPORTER_OTLP_ENDPOINT is set
 * (Aspire injects this automatically for managed resources).
 * Safe to call even when Aspire is not running — it's a no-op.
 */
export function initTelemetry(): void {
  if (sdk) return // Already initialized

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) {
    console.log('[Telemetry] OTEL_EXPORTER_OTLP_ENDPOINT not set — telemetry disabled')
    return
  }

  // Optional: diagnostic logging for OTel SDK itself
  if (process.env.OTEL_LOG_LEVEL === 'debug') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'buddy'
  const serviceVersion = process.env.npm_package_version ?? '0.0.0'

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
  })

  // --- Log exporter (separate provider so we can emit logs programmatically) ---
  const logExporter = new OTLPLogExporter({ url: `${endpoint}/v1/logs` })
  loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(logExporter)],
  })
  logs.setGlobalLoggerProvider(loggerProvider)

  // --- Trace + Metrics SDK ---
  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [new HttpInstrumentation(), new DnsInstrumentation()],
  })

  sdk.start()

  // Create the shared meter
  meter = metrics.getMeter(serviceName, serviceVersion)

  // Initialize metric instruments
  ipcCallCounter = meter.createCounter('buddy.ipc.calls', {
    description: 'Number of IPC handler invocations',
    unit: '{calls}',
  })
  ipcDurationHistogram = meter.createHistogram('buddy.ipc.duration', {
    description: 'IPC handler execution time',
    unit: 'ms',
  })
  ipcErrorCounter = meter.createCounter('buddy.ipc.errors', {
    description: 'Number of IPC handler errors',
    unit: '{errors}',
  })
  windowOpenCounter = meter.createCounter('buddy.windows.opened', {
    description: 'Number of browser windows opened',
    unit: '{windows}',
  })

  console.log(`[Telemetry] Initialized — exporting to ${endpoint} as '${serviceName}'`)
}

/**
 * Gracefully flush and shut down all telemetry providers.
 * Call this in the `before-quit` handler.
 */
export async function shutdownTelemetry(): Promise<void> {
  try {
    await loggerProvider?.shutdown()
    await sdk?.shutdown()
  } catch (err) {
    console.warn('[Telemetry] Shutdown error:', err)
  }
}

// ---------------------------------------------------------------------------
// Tracing helpers
// ---------------------------------------------------------------------------

const tracer = () => trace.getTracer('buddy')

/**
 * Wrap an async function in an OTel span.
 * Automatically sets status to ERROR on exception and records the error.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async span => {
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
      span.recordException(err instanceof Error ? err : new Error(String(err)))
      throw err
    } finally {
      span.end()
    }
  })
}

// ---------------------------------------------------------------------------
// Metrics helpers
// ---------------------------------------------------------------------------

/** Record an IPC call with its channel name and duration. */
export function recordIpcCall(channel: string, durationMs: number, error?: boolean): void {
  const attrs = { 'ipc.channel': channel }
  ipcCallCounter?.add(1, attrs)
  ipcDurationHistogram?.record(durationMs, attrs)
  if (error) {
    ipcErrorCounter?.add(1, attrs)
  }
}

/** Record a browser window being opened. */
export function recordWindowOpen(target: string): void {
  windowOpenCounter?.add(1, { 'window.target': target })
}

// ---------------------------------------------------------------------------
// Structured logging helper
// ---------------------------------------------------------------------------

const logger = () => logs.getLogger('buddy')

/** Emit a structured log record to the OTLP endpoint. */
export function emitLog(
  severity: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  message: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const severityMap: Record<string, SeverityNumber> = {
    DEBUG: SeverityNumber.DEBUG,
    INFO: SeverityNumber.INFO,
    WARN: SeverityNumber.WARN,
    ERROR: SeverityNumber.ERROR,
  }

  logger().emit({
    severityNumber: severityMap[severity] ?? SeverityNumber.INFO,
    severityText: severity,
    body: message,
    attributes,
  })
}
