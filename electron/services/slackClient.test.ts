import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnvValues = vi.hoisted(() => new Map<string, string | undefined>())

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('gh api')) return 'test@example.com\n'
    return ''
  }),
}))

vi.mock('../../src/utils/envLookup', () => ({
  createEnvResolver: vi.fn(() => (name: string) => mockEnvValues.get(name)),
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { nudgePRAuthor } from './slackClient'

describe('slackClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnvValues.clear()
    mockEnvValues.set('SLACK_BOT_TOKEN', 'xoxb-test-token')
    mockFetch.mockReset()
  })

  it('does not use direct process.env fallback when resolver has no token', async () => {
    const previousToken = process.env.SLACK_BOT_TOKEN
    mockEnvValues.clear()
    process.env.SLACK_BOT_TOKEN = 'xoxb-direct-token'

    try {
      const result = await nudgePRAuthor('testuser', 'Fix: bug', 'https://github.com/pr/1')

      expect(result).toEqual({
        success: false,
        error: 'SLACK_BOT_TOKEN not configured. Set it as a system environment variable.',
      })
      expect(mockFetch).not.toHaveBeenCalled()
    } finally {
      if (previousToken === undefined) {
        delete process.env.SLACK_BOT_TOKEN
      } else {
        process.env.SLACK_BOT_TOKEN = previousToken
      }
    }
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

  it('nudgePRAuthor returns error when DM conversation.open fails', async () => {
    // lookupByEmail → found user
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, user: { id: 'U12345' } }),
    })
    // conversations.open → fails
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'channel_not_found' }),
    })

    const result = await nudgePRAuthor('dmfailuser', 'Fix: bug', 'https://github.com/pr/1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to open DM')
  })

  it('nudgePRAuthor returns error when chat.postMessage fails', async () => {
    // lookupByEmail → found user
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, user: { id: 'U12345' } }),
    })
    // conversations.open → success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, channel: { id: 'D12345' } }),
    })
    // chat.postMessage → fails
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'not_authed' }),
    })

    const result = await nudgePRAuthor('msgfailuser', 'Fix: bug', 'https://github.com/pr/1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to send message')
  })

  it('nudgePRAuthor tries corporate email patterns when no public email', async () => {
    // Override execSync to return no email (empty string)
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValueOnce('\n')

    // First corporate pattern lookup fails
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'users_not_found' }),
    })
    // Second corporate pattern lookup fails
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'users_not_found' }),
    })

    const result = await nudgePRAuthor('nomail', 'Fix', 'https://github.com/pr/1')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Could not find Slack user')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('nudgePRAuthor succeeds via corporate email pattern when no public email', async () => {
    // Override execSync to return no email (empty string)
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValueOnce('\n')

    // First corporate pattern lookup succeeds (relias.com)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'UCORP1' } }),
      })
      // conversations.open
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: { id: 'DCORP' } }),
      })
      // chat.postMessage
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    const result = await nudgePRAuthor('corpuser', 'Fix: corp bug', 'https://github.com/pr/9')
    expect(result.success).toBe(true)
  })

  it('nudgePRAuthor caches resolved slack IDs', async () => {
    // First call: lookup succeeds
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'UCACHED' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: { id: 'D999' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    await nudgePRAuthor('cacheuser', 'PR1', 'https://github.com/pr/1')

    // Reset mock to clear queued responses and call history
    mockFetch.mockReset()

    // Second call: should use cached ID, skip lookupByEmail
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: { id: 'D999' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    const result = await nudgePRAuthor('cacheuser', 'PR2', 'https://github.com/pr/2')
    expect(result.success).toBe(true)
    // Should have only called conversations.open and chat.postMessage (no lookupByEmail)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
