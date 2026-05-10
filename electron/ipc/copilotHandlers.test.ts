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

  it('copilot:cancel returns error on failure', async () => {
    mockService.cancelPrompt.mockImplementationOnce(() => {
      throw new Error('No such result')
    })
    const handler = handlers.get('copilot:cancel')!
    const result = await handler({}, 'bad-id')
    expect(result).toEqual({ success: false, error: 'No such result' })
  })

  it('copilot:list-models returns model list', async () => {
    const handler = handlers.get('copilot:list-models')!
    const result = await handler({})
    expect(result).toEqual(['gpt-4', 'gpt-3.5'])
  })

  it('copilot:list-models passes ghAccount parameter', async () => {
    const handler = handlers.get('copilot:list-models')!
    await handler({}, 'my-account')
    expect(mockService.listModels).toHaveBeenCalledWith('my-account')
  })

  it('copilot:list-models returns error on failure', async () => {
    mockService.listModels.mockRejectedValueOnce(new Error('SDK error'))
    const handler = handlers.get('copilot:list-models')!
    const result = await handler({})
    expect(result).toEqual({ error: 'SDK error' })
  })

  it('copilot:chat-send returns chat response', async () => {
    const { sendChatMessage } = await import('../services/copilotClient')
    const handler = handlers.get('copilot:chat-send')!
    const args = {
      message: 'Hello',
      context: 'some context',
      conversationHistory: [],
    }
    const result = await handler({}, args)
    expect(sendChatMessage).toHaveBeenCalledWith(args)
    expect(result).toEqual({ message: 'hello' })
  })

  it('copilot:chat-send throws on failure', async () => {
    const { sendChatMessage } = await import('../services/copilotClient')
    vi.mocked(sendChatMessage).mockRejectedValueOnce(new Error('Network error'))
    const handler = handlers.get('copilot:chat-send')!
    await expect(
      handler({}, { message: 'hi', context: '', conversationHistory: [] })
    ).rejects.toThrow('Network error')
  })

  it('copilot:quick-prompt returns prompt response', async () => {
    const { sendPrompt } = await import('../services/copilotClient')
    const handler = handlers.get('copilot:quick-prompt')!
    const result = await handler({}, { prompt: 'Summarize this' })
    expect(sendPrompt).toHaveBeenCalledWith({
      prompt: 'Summarize this',
      model: undefined,
      timeout: 30_000,
    })
    expect(result).toEqual({ text: 'response' })
  })

  it('copilot:quick-prompt throws on failure', async () => {
    const { sendPrompt } = await import('../services/copilotClient')
    vi.mocked(sendPrompt).mockRejectedValueOnce(new Error('Timeout'))
    const handler = handlers.get('copilot:quick-prompt')!
    await expect(handler({}, { prompt: 'test' })).rejects.toThrow('Timeout')
  })
})
