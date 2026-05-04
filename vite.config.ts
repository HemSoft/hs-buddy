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

// Vite 8 uses Rolldown which outputs ESM by default for "type":"module" projects.
// CJS dependencies bundled into the ESM main process lose access to `require`.
// Inject a Node.js-native require via createRequire so Rolldown's __require shim works.
const requireShim = [
  "import { createRequire as __createRequire } from 'node:module';",
  'const require = __createRequire(import.meta.url);',
].join('\n')

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // In E2E mode (--mode e2e OR VITE_E2E=1), skip the Electron plugin entirely
  // so Vite serves only the renderer bundle. The E2E tests inject IPC mocks via addInitScript.
  const isE2E = mode === 'e2e' || process.env.VITE_E2E === '1'

  return {
    // In E2E mode, alias convex/react to a mock module that provides no-op hooks.
    // This prevents the real Convex client from trying WebSocket connections.
    ...(isE2E
      ? {
          resolve: {
            alias: {
              'convex/react': path.resolve(__dirname, 'testing/convex-react-mock.ts'),
            },
          },
        }
      : {}),
    plugins: [
      react(),
      ...(!isE2E
        ? [
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
                      output: {
                        banner: requireShim,
                      },
                    },
                  },
                },
              },
              preload: {
                input: path.join(__dirname, 'electron/preload.ts'),
              },
              renderer: process.env.NODE_ENV === 'test' ? undefined : {},
            }),
          ]
        : []),
    ],
  }
})
