import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/components/pr-threads/diffHunkUtils.test.ts',
      'src/utils/budgetUtils.test.ts',
      'src/utils/diffUtils.test.ts',
      'src/utils/dispatcherBackoff.test.ts',
      'src/utils/financeCalc.test.ts',
      'src/utils/githubUrl.test.ts',
      'src/utils/labelStyle.test.ts',
      'src/utils/networkSecurity.test.ts',
      'src/utils/prReviewEvents.test.ts',
      'src/utils/shortcutMatching.test.ts',
      'src/utils/taskGrouping.test.ts',
      'src/utils/toolCallParsing.test.ts',
    ],
  },
})
