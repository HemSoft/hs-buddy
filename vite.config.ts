import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// Heavy OpenTelemetry SDK/exporter packages are externalized to avoid bundling
// ~2 MB of code that's only used during development (with Aspire).
// The lightweight API packages (@opentelemetry/api, api-logs) remain bundled
// since they provide no-op implementations when the SDK isn't loaded.
const otelExternals = [
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            target: 'esnext',
            rollupOptions: {
              // node-pty is a native module — must not be bundled.
              // OTel SDK packages are dev-only (Aspire) — lazy-loaded at runtime.
              external: ['node-pty', ...otelExternals],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
})
