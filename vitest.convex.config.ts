import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['convex/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage-convex',
      include: ['convex/**/*.ts'],
      exclude: [
        'convex/_generated/**',
        'convex/__tests__/**',
        'convex/**/*.bench.ts',
        'convex/crons.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
