import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('../services/copilotSessionService', () => ({
  scanCopilotSessions: vi.fn().mockResolvedValue([{ filePath: '/sessions/a.jsonl', turns: 5 }]),
  getSessionDetail: vi.fn().mockResolvedValue({ turns: [], model: 'gpt-4' }),
  getVSCodeStoragePath: vi.fn(() => '/home/user/.config/Code/User/workspaceStorage'),
  computeSessionDigest: vi.fn(() => ({ totalTokens: 100 })),
  resolveWorkspaceName: vi.fn(() => 'my-project'),
}))

vi.mock('../../src/utils/copilotSessionParsing', () => ({
  validateSessionPath: vi.fn((filePath: string, storagePath: string) => {
    if (filePath.startsWith(storagePath) && filePath.endsWith('.jsonl')) return filePath
    return null
  }),
}))

import { ipcMain } from 'electron'
import { registerCopilotSessionHandlers } from './copilotSessionHandlers'

describe('copilotSessionHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerCopilotSessionHandlers()
  })

  it('registers expected channels', () => {
    expect(handlers.has('copilot-sessions:scan')).toBe(true)
    expect(handlers.has('copilot-sessions:get-session')).toBe(true)
    expect(handlers.has('copilot-sessions:compute-digest')).toBe(true)
  })

  it('copilot-sessions:scan returns session list', async () => {
    const handler = handlers.get('copilot-sessions:scan')!
    const result = await handler({})
    expect(result).toEqual([{ filePath: '/sessions/a.jsonl', turns: 5 }])
  })

  it('copilot-sessions:get-session returns null for invalid path', async () => {
    const handler = handlers.get('copilot-sessions:get-session')!
    const result = await handler({}, '/etc/passwd')
    expect(result).toBeNull()
  })

  it('copilot-sessions:get-session returns session for valid path', async () => {
    const handler = handlers.get('copilot-sessions:get-session')!
    const storagePath = '/home/user/.config/Code/User/workspaceStorage'
    const result = await handler({}, `${storagePath}/abc/session.jsonl`)
    expect(result).toEqual({ turns: [], model: 'gpt-4' })
  })
})
