import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join, resolve } from 'node:path'
import { IPC_INVOKE } from '../../src/ipc/contracts'

const mocks = vi.hoisted(() => ({
  appGetPath: vi.fn(),
  ipcHandle: vi.fn(),
  normalizeSnapshot: vi.fn(),
  parseContent: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getPath: mocks.appGetPath,
  },
  ipcMain: {
    handle: mocks.ipcHandle,
  },
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  stat: mocks.stat,
}))

vi.mock('../../src/utils/copilotEnterpriseUsers', () => ({
  normalizeCopilotEnterpriseUsersSnapshot: mocks.normalizeSnapshot,
  parseCopilotEnterpriseUsersContent: mocks.parseContent,
}))

import { registerCopilotMetricsHandlers, resolveCopilotMetricsFile } from './copilotMetricsHandlers'

const originalMetricsFile = process.env.COPILOT_METRICS_FILE

describe('copilotMetricsHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    if (originalMetricsFile === undefined) delete process.env.COPILOT_METRICS_FILE
    else process.env.COPILOT_METRICS_FILE = originalMetricsFile
    mocks.appGetPath.mockReturnValue('C:\\Users\\User\\AppData\\Roaming\\hs-buddy')
  })

  it('resolves an explicit Copilot metrics file override', () => {
    process.env.COPILOT_METRICS_FILE = 'C:\\metrics\\copilot-metrics.json'

    expect(resolveCopilotMetricsFile()).toBe(resolve('C:\\metrics\\copilot-metrics.json'))
    expect(mocks.appGetPath).not.toHaveBeenCalled()
  })

  it('falls back to the portable Electron userData location', () => {
    delete process.env.COPILOT_METRICS_FILE

    expect(resolveCopilotMetricsFile()).toBe(
      join('C:\\Users\\User\\AppData\\Roaming\\hs-buddy', 'copilot-metrics.json')
    )
  })

  it('reads the resolved file path when handling enterprise users', async () => {
    const metricsFile = 'C:\\metrics\\copilot-metrics.json'
    const parsed = { users: [] }
    const snapshot = { generatedAt: '2026-06-03T00:00:00.000Z', users: [] }
    process.env.COPILOT_METRICS_FILE = metricsFile
    mocks.stat.mockResolvedValue({ mtime: new Date('2026-06-03T01:02:03.000Z') })
    mocks.readFile.mockResolvedValue('{"users":[]}')
    mocks.parseContent.mockReturnValue(parsed)
    mocks.normalizeSnapshot.mockReturnValue(snapshot)

    registerCopilotMetricsHandlers()
    const handler = mocks.ipcHandle.mock.calls.find(
      ([channel]) => channel === IPC_INVOKE.GITHUB_GET_COPILOT_ENTERPRISE_USERS
    )?.[1]

    const result = await handler()
    const resolvedFile = resolve(metricsFile)

    expect(mocks.stat).toHaveBeenCalledWith(resolvedFile)
    expect(mocks.readFile).toHaveBeenCalledWith(resolvedFile, 'utf-8')
    expect(mocks.normalizeSnapshot).toHaveBeenCalledWith(parsed, {
      sourceFile: resolvedFile,
      fileLastWriteTime: '2026-06-03T01:02:03.000Z',
    })
    expect(result).toEqual({ success: true, data: snapshot })
  })
})
