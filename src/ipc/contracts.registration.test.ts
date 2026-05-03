/**
 * Contract registration test — verifies that the Electron main process
 * actually registers channels matching the contract registry.
 *
 * Mocks electron's ipcMain to capture handle/on calls, then runs
 * registerAllHandlers and compares against ALL_INVOKE_CHANNELS,
 * ALL_SEND_CHANNELS, and CONFIG_UI_CHANNELS.
 *
 * Push channels (main → renderer via webContents.send) are verified
 * separately since they're sent at runtime, not registered at startup.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'

// ─── Capture arrays for channel registrations ────────────────────────────────

const registeredHandleChannels: string[] = []
const registeredOnChannels: string[] = []

// ─── Mock electron (must be before any handler imports) ──────────────────────

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string) => {
      registeredHandleChannels.push(channel)
    }),
    on: vi.fn((channel: string) => {
      registeredOnChannels.push(channel)
    }),
  },
  BrowserWindow: vi.fn(),
  dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp'), isPackaged: false, on: vi.fn() },
}))

// ─── Auto-mock heavy electron-side dependencies ──────────────────────────────

vi.mock('electron-store', () => ({
  default: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    store: {},
    path: '/tmp/config.json',
  })),
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: vi.fn(() => ({
    query: vi.fn(),
    mutation: vi.fn(),
    action: vi.fn(),
  })),
}))

vi.mock('../../convex/_generated/api', () => ({ api: {} }))

vi.mock('../../electron/config', () => ({
  configManager: {
    getUiValue: vi.fn(),
    setUiValue: vi.fn(),
    getConfig: vi.fn(() => ({})),
    getStorePath: vi.fn(() => '/tmp/config.json'),
    reset: vi.fn(),
    getScheduleForecastDays: vi.fn(() => 7),
    setScheduleForecastDays: vi.fn(),
    getCopilotPRReviewPromptTemplate: vi.fn(() => ''),
    setCopilotPRReviewPromptTemplate: vi.fn(),
    getNotificationSoundEnabled: vi.fn(() => false),
    setNotificationSoundEnabled: vi.fn(),
    getNotificationSoundPath: vi.fn(() => ''),
    setNotificationSoundPath: vi.fn(),
    getFinanceWatchlist: vi.fn(() => []),
    setFinanceWatchlist: vi.fn(),
  },
  CONVEX_URL: 'https://test.convex.cloud',
}))

vi.mock('../../electron/cache', () => ({
  readDataCache: vi.fn(() => ({})),
  writeDataCacheEntry: vi.fn(),
  deleteDataCacheEntry: vi.fn(),
  clearDataCache: vi.fn(),
}))

vi.mock('../../electron/telemetry', () => ({
  withSpan: vi.fn((_name: string, _attrs: unknown, fn: () => unknown) => fn()),
  recordIpcCall: vi.fn(),
  emitLog: vi.fn(),
}))

vi.mock('../../electron/utils', () => ({
  execAsync: vi.fn(),
  execFileAsync: vi.fn(),
}))

vi.mock('../../electron/services/copilotService', () => ({
  getCopilotService: vi.fn(() => ({
    execute: vi.fn(),
    cancel: vi.fn(),
    getActiveCount: vi.fn(() => 0),
    listModels: vi.fn(() => []),
  })),
}))

vi.mock('../../electron/services/copilotClient', () => ({
  sendChatMessage: vi.fn(),
  abortChat: vi.fn(),
  sendPrompt: vi.fn(),
}))

vi.mock('../../electron/services/copilotSessionService', () => ({
  scanSessions: vi.fn(),
  getSession: vi.fn(),
  computeDigest: vi.fn(),
}))

vi.mock('../../electron/services/crewService', () => ({
  addProject: vi.fn(),
  listProjects: vi.fn(() => []),
  removeProject: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  addMessage: vi.fn(),
  updateSessionStatus: vi.fn(),
  updateChangedFiles: vi.fn(),
  clearSession: vi.fn(),
  undoFile: vi.fn(),
}))

vi.mock('../../electron/services/tempoClient', () => ({
  getToday: vi.fn(),
  getRange: vi.fn(),
  getWeek: vi.fn(),
  createWorklog: vi.fn(),
  updateWorklog: vi.fn(),
  deleteWorklog: vi.fn(),
  getAccounts: vi.fn(),
  getProjectAccounts: vi.fn(),
  getCapexMap: vi.fn(),
  getSchedule: vi.fn(),
}))

vi.mock('../../electron/services/todoistClient', () => ({
  getUpcoming: vi.fn(),
  getToday: vi.fn(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getProjects: vi.fn(),
}))

vi.mock('../../electron/services/slackClient', () => ({
  nudgeAuthor: vi.fn(),
}))

vi.mock('../../electron/services/ralphService', () => ({
  launchLoop: vi.fn(),
  stopLoop: vi.fn(),
  listLoops: vi.fn(() => []),
  getLoopStatus: vi.fn(),
  getConfig: vi.fn(),
  getScriptsPath: vi.fn(() => '/tmp'),
  listTemplateScripts: vi.fn(() => []),
  setStatusChangeCallback: vi.fn(),
}))

vi.mock('node:module', () => {
  const mockRequire = vi.fn(() => ({}))
  return {
    default: { createRequire: vi.fn(() => mockRequire) },
    createRequire: vi.fn(() => mockRequire),
  }
})

vi.mock('node:child_process', () => ({
  default: {},
  execFileSync: vi.fn(() => ''),
  execFile: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {},
  existsSync: vi.fn(() => false),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
  readFileSync: vi.fn(() => ''),
}))

vi.mock('node:fs/promises', () => ({
  default: {},
  readFile: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(() => []),
}))

vi.mock('node:dns/promises', () => ({
  default: {},
  resolve: vi.fn(),
}))

// ─── Import contract definitions ─────────────────────────────────────────────

import { ALL_INVOKE_CHANNELS, ALL_SEND_CHANNELS, CONFIG_UI_CHANNELS } from './contracts'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IPC Contract Registration', () => {
  beforeAll(async () => {
    // Dynamically import to ensure mocks are in place first
    const { registerAllHandlers } = await import('../../electron/ipc/index')

    // Create a minimal BrowserWindow mock
    const mockWin = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      isMaximized: vi.fn(() => false),
      close: vi.fn(),
      webContents: {
        send: vi.fn(),
        on: vi.fn(),
        toggleDevTools: vi.fn(),
      },
      on: vi.fn(),
    } as never

    registerAllHandlers(mockWin)
  })

  it('all contract invoke channels are registered via ipcMain.handle', () => {
    const missingInvoke = ALL_INVOKE_CHANNELS.filter(ch => !registeredHandleChannels.includes(ch))
    expect(missingInvoke).toEqual([])
  })

  it('all contract send channels are registered via ipcMain.on', () => {
    const missingSend = ALL_SEND_CHANNELS.filter(ch => !registeredOnChannels.includes(ch))
    expect(missingSend).toEqual([])
  })

  it('all config UI channels are registered via ipcMain.handle', () => {
    const missingConfig = CONFIG_UI_CHANNELS.filter(ch => !registeredHandleChannels.includes(ch))
    expect(missingConfig).toEqual([])
  })

  it('no uncontracted channels are registered via ipcMain.handle', () => {
    const allContractedHandleChannels = new Set([...ALL_INVOKE_CHANNELS, ...CONFIG_UI_CHANNELS])
    const uncontracted = registeredHandleChannels.filter(ch => !allContractedHandleChannels.has(ch))
    expect(uncontracted).toEqual([])
  })

  it('no uncontracted channels are registered via ipcMain.on', () => {
    const allContractedOnChannels = new Set(ALL_SEND_CHANNELS)
    const uncontracted = registeredOnChannels.filter(
      ch => !allContractedOnChannels.has(ch as never)
    )
    expect(uncontracted).toEqual([])
  })
})
