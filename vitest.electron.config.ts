import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['electron/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage-electron',
      include: ['electron/**/*.ts'],
      exclude: [
        'electron/**/*.test.ts',
        'electron/**/*.bench.ts',
        'electron/electron-env.d.ts',
        'electron/__mocks__/**',
      ],
      thresholds: {
        statements: 94,
        branches: 86,
        functions: 89,
        lines: 95,
      },
    },
  },
})
