/**
 * Shared test utilities for component smoke tests.
 * Provides standard mocks for common hooks and IPC.
 */
import { vi } from 'vitest'

// Standard mock for useConfig hooks
export function mockUseConfig() {
  vi.mock('../hooks/useConfig', () => ({
    useGitHubAccounts: () => ({
      accounts: [{ username: 'testuser', org: 'testorg' }],
      loading: false,
      addAccount: vi.fn(),
      removeAccount: vi.fn(),
    }),
    usePRSettings: () => ({
      settings: { refreshIntervalMinutes: 5, staleDays: 30 },
      update: vi.fn(),
    }),
    useCopilotSettings: () => ({
      settings: { model: 'gpt-4', apiKey: '' },
      update: vi.fn(),
    }),
  }))
}

// Standard mock for useConvex hooks
export function mockUseConvex() {
  vi.mock('../hooks/useConvex', () => ({
    useBuddyStats: () => ({ tabsOpened: 10, sessionsStarted: 5 }),
    useRepoBookmarks: () => [],
    useRepoBookmarkMutations: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }),
    useSchedules: () => [],
    useSchedule: () => null,
    useScheduleMutations: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), toggle: vi.fn() }),
    useJobs: () => [],
    useJob: () => null,
    useJobMutations: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }),
    useRecentRuns: () => [],
    useJobRuns: () => [],
    useScheduleRuns: () => [],
    useRunMutations: () => ({ create: vi.fn(), markRunning: vi.fn(), complete: vi.fn(), fail: vi.fn(), cancel: vi.fn(), cleanup: vi.fn() }),
    useCopilotResultsRecent: () => [],
    useCopilotResult: () => null,
    useCopilotActiveCount: () => 0,
    useCopilotResultMutations: () => ({ create: vi.fn(), markRunning: vi.fn(), complete: vi.fn(), fail: vi.fn(), remove: vi.fn(), cleanup: vi.fn() }),
    usePRReviewRunsByPR: () => [],
    useLatestPRReviewRun: () => null,
    useGitHubAccountsConvex: () => [],
    useGitHubAccountMutations: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), bulkImport: vi.fn() }),
    useSettings: () => null,
    useSettingsMutations: () => ({ updatePR: vi.fn(), updateCopilot: vi.fn(), reset: vi.fn(), initFromMigration: vi.fn() }),
    useBuddyStatsMutations: () => ({ increment: vi.fn(), batchIncrement: vi.fn(), recordSessionStart: vi.fn(), recordSessionEnd: vi.fn(), checkpointUptime: vi.fn() }),
  }))
}

// Setup IPC mocks on window
export function mockIPC() {
  Object.defineProperty(window, 'ipcRenderer', {
    value: {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window, 'shell', {
    value: { openExternal: vi.fn() },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window, 'github', {
    value: {
      getCopilotQuota: vi.fn().mockResolvedValue({ success: false }),
      getCopilotBudget: vi.fn().mockResolvedValue({ success: false }),
    },
    writable: true,
    configurable: true,
  })
}
