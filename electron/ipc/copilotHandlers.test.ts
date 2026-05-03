import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

const mockService = {
  executePrompt: vi.fn().mockResolvedValue({ resultId: 'r1', success: true }),
  cancelPrompt: vi.fn(() => true),
  getActiveCount: vi.fn(() => 2),
  listModels: vi.fn().mockResolvedValue(['gpt-4', 'gpt-3.5']),
}

vi.mock('../services/copilotService', () => ({
  getCopilotService: vi.fn(() => mockService),
}))

vi.mock('../services/copilotClient', () => ({
  sendChatMessage: vi.fn().mockResolvedValue({ message: 'hello' }),
  abortChat: vi.fn(),
  sendPrompt: vi.fn().mockResolvedValue({ text: 'response' }),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}))

import { ipcMain } from 'electron'
import { registerCopilotHandlers } from './copilotHandlers'
import { getCopilotService } from '../services/copilotService'

describe('copilotHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerCopilotHandlers()
  })

  it('registers expected channels', () => {
    expect(handlers.has('copilot:execute')).toBe(true)
    expect(handlers.has('copilot:cancel')).toBe(true)
    expect(handlers.has('copilot:active-count')).toBe(true)
    expect(handlers.has('copilot:list-models')).toBe(true)
    expect(handlers.has('copilot:chat-send')).toBe(true)
    expect(handlers.has('copilot:chat-abort')).toBe(true)
    expect(handlers.has('copilot:quick-prompt')).toBe(true)
  })

  it('copilot:execute delegates to service.executePrompt', async () => {
    const handler = handlers.get('copilot:execute')!
    const result = await handler({}, { prompt: 'test', category: 'code' })
    expect(result).toEqual({ resultId: 'r1', success: true })
    expect(getCopilotService).toHaveBeenCalled()
  })

  it('copilot:execute returns error on failure', async () => {
    mockService.executePrompt.mockRejectedValueOnce(new Error('timeout'))
    const handler = handlers.get('copilot:execute')!
    const result = await handler({}, { prompt: 'test' })
    expect(result).toEqual({ resultId: null, success: false, error: 'timeout' })
  })

  it('copilot:cancel delegates to service.cancelPrompt', async () => {
    const handler = handlers.get('copilot:cancel')!
    const result = await handler({}, 'r1')
    expect(result).toEqual({ success: true })
  })

  it('copilot:active-count returns count from service', async () => {
    const handler = handlers.get('copilot:active-count')!
    const result = await handler({})
    expect(result).toBe(2)
  })

  it('copilot:chat-abort calls abortChat', async () => {
    const { abortChat } = await import('../services/copilotClient')
    const handler = handlers.get('copilot:chat-abort')!
    const result = await handler({})
    expect(abortChat).toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })
})
