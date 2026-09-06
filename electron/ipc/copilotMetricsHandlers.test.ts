import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { IPC_INVOKE } from '../../src/ipc/contracts'

const mocks = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  normalizeSnapshot: vi.fn(),
  parseContent: vi.fn(),
  readFileSnapshot: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
}))

vi.mock('../services/fileSnapshots', () => ({
  readFileSnapshot: mocks.readFileSnapshot,
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
  })

  it('resolves an explicit Copilot metrics file override', () => {
    process.env.COPILOT_METRICS_FILE = 'C:\\metrics\\copilot-metrics.json'

    expect(resolveCopilotMetricsFile()).toBe(resolve('C:\\metrics\\copilot-metrics.json'))
  })

  it('falls back to the CodexBar Copilot metrics snapshot', () => {
    delete process.env.COPILOT_METRICS_FILE

    expect(resolveCopilotMetricsFile()).toBe(
      resolve('D:\\github\\HemSoft\\codexbar\\data\\copilot-metrics.json')
    )
  })

  it('reads the resolved file path when handling enterprise users', async () => {
    const metricsFile = 'C:\\metrics\\copilot-metrics.json'
    const parsed = { users: [] }
    const snapshot = { generatedAt: '2026-06-03T00:00:00.000Z', users: [] }
    process.env.COPILOT_METRICS_FILE = metricsFile
    mocks.readFileSnapshot.mockResolvedValue({
      stats: { mtime: new Date('2026-06-03T01:02:03.000Z') },
      data: Buffer.from('{"users":[]}'),
    })
    mocks.parseContent.mockReturnValue(parsed)
    mocks.normalizeSnapshot.mockReturnValue(snapshot)

    registerCopilotMetricsHandlers()
    const handler = mocks.ipcHandle.mock.calls.find(
      ([channel]) => channel === IPC_INVOKE.GITHUB_GET_COPILOT_ENTERPRISE_USERS
    )?.[1]

    const result = await handler()
    const resolvedFile = resolve(metricsFile)

    expect(mocks.readFileSnapshot).toHaveBeenCalledWith(resolvedFile)
    expect(mocks.normalizeSnapshot).toHaveBeenCalledWith(parsed, {
      sourceFile: resolvedFile,
      fileLastWriteTime: '2026-06-03T01:02:03.000Z',
    })
    expect(result).toEqual({ success: true, data: snapshot })
  })

  it('reports an opened-file read failure without publishing a snapshot', async () => {
    mocks.readFileSnapshot.mockRejectedValue(new Error('File disappeared'))
    registerCopilotMetricsHandlers()
    const handler = mocks.ipcHandle.mock.calls.find(
      ([channel]) => channel === IPC_INVOKE.GITHUB_GET_COPILOT_ENTERPRISE_USERS
    )?.[1]
    expect(await handler()).toEqual({ success: false, error: 'File disappeared' })
    expect(mocks.normalizeSnapshot).not.toHaveBeenCalled()
  })
})
