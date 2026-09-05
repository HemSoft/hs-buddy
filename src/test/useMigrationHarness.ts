import { vi } from 'vitest'

export const mockBulkImportAccounts = vi.fn()
export const mockInitSettings = vi.fn()
export const mockInvoke = vi.fn()

export const migrationState = {
  existingAccounts: undefined as Array<Record<string, unknown>> | undefined,
  existingSettings: undefined as Record<string, unknown> | undefined,
  connectionCount: 1,
  isWebSocketConnected: true,
}

function refNameIncludes(ref: unknown, value: string) {
  const name = (ref as { name?: string } | undefined)?.name
  return String(name ?? '').includes(value) || String(ref).includes(value)
}

vi.mock('convex/react', () => ({
  useConvexConnectionState: () => ({
    connectionCount: migrationState.connectionCount,
    isWebSocketConnected: migrationState.isWebSocketConnected,
  }),
  useMutation: (ref: unknown) => {
    if (refNameIncludes(ref, 'bulkImport')) {
      return mockBulkImportAccounts
    }
    return mockInitSettings
  },
  useQuery: (ref: unknown) => {
    if (refNameIncludes(ref, 'list')) {
      return migrationState.existingAccounts
    }
    return migrationState.existingSettings
  },
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    githubAccounts: {
      bulkImport: { name: 'bulkImport' },
      list: { name: 'list' },
    },
    settings: {
      initFromMigration: { name: 'initFromMigration' },
      get: { name: 'get' },
    },
  },
}))

export function setLocalAccounts(accounts: Array<Record<string, unknown>>) {
  mockInvoke.mockResolvedValue({
    github: { accounts },
    pr: { refreshInterval: 10, autoRefresh: true },
  })
}

Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
})
