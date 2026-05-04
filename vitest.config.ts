import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'src/features/*.steps.ts',
      'scripts/**/*.test.ts',
      'perf/**/*.test.ts',
    ],
    environmentMatchGlobs: [
      ['scripts/**/*.test.ts', 'node'],
      ['perf/**/*.test.ts', 'node'],
      ['perf/**/*.bench.ts', 'node'],
      ['src/**/*.bench.ts', 'node'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json-summary', 'cobertura'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.bench.ts',
        'src/features/**',
        'src/types/**',
        'src/dev/**',
        'src/components/automation/index.ts',
        'src/components/settings/index.ts',
        'src/components/copilot-usage/types.ts',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
