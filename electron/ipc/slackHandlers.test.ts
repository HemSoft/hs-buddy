import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('./ipcHandler', () => ({
  ipcHandler: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('../services/slackClient', () => ({
  nudgePRAuthor: vi.fn().mockResolvedValue({ success: true }),
}))

import { ipcMain } from 'electron'
import { registerSlackHandlers } from './slackHandlers'

describe('slackHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerSlackHandlers()
  })

  it('registers slack:nudge-author channel', () => {
    expect(handlers.has('slack:nudge-author')).toBe(true)
  })

  it('slack:nudge-author delegates to nudgePRAuthor', async () => {
    const { nudgePRAuthor } = await import('../services/slackClient')
    const handler = handlers.get('slack:nudge-author')!
    const params = { githubLogin: 'user1', prTitle: 'fix: stuff', prUrl: 'https://github.com/pr/1' }
    const result = await handler({}, params)
    expect(nudgePRAuthor).toHaveBeenCalledWith('user1', 'fix: stuff', 'https://github.com/pr/1')
    expect(result).toEqual({ success: true })
  })

  it('slack:nudge-author returns error for missing params', async () => {
    const handler = handlers.get('slack:nudge-author')!
    const result = await handler({}, { githubLogin: '', prTitle: '', prUrl: '' })
    expect(result).toEqual({ success: false, error: 'Missing required parameters' })
  })
})
