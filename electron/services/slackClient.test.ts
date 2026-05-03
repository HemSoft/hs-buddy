import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('gh api')) return 'test@example.com\n'
    return ''
  }),
}))

vi.mock('../../src/utils/envLookup', () => ({
  createEnvResolver: vi.fn(() => (name: string) => {
    if (name === 'SLACK_BOT_TOKEN') return 'xoxb-test-token'
    return undefined
  }),
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { nudgePRAuthor } from './slackClient'

describe('slackClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('nudgePRAuthor resolves github login, opens DM, sends message', async () => {
    // Call 1: lookupByEmail → found user
    // Call 2: conversations.open → success
    // Call 3: chat.postMessage → success
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'U12345' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: { id: 'D12345' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    const result = await nudgePRAuthor('testuser', 'Fix: bug', 'https://github.com/pr/1')
    expect(result).toEqual({ success: true })
  })

  it('nudgePRAuthor returns error when user lookup fails', async () => {
    // lookupByEmail → not found
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'users_not_found' }),
    })

    const result = await nudgePRAuthor('unknown', 'Fix', 'https://github.com/pr/1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Could not find Slack user')
  })
})
