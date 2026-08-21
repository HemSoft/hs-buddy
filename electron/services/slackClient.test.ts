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

  it('supplies a bounded timeout signal to every Slack request', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'UTIMEOUT' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: { id: 'DTIMEOUT' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    try {
      const result = await nudgePRAuthor(
        'timeoutsignals',
        'Fix: timeout signals',
        'https://github.com/pr/2'
      )

      expect(result).toEqual({ success: true })
      expect(timeoutSpy).toHaveBeenCalledTimes(3)
      expect(timeoutSpy).toHaveBeenNthCalledWith(1, 15_000)
      expect(timeoutSpy).toHaveBeenNthCalledWith(2, 15_000)
      expect(timeoutSpy).toHaveBeenNthCalledWith(3, 15_000)
      for (const [, init] of mockFetch.mock.calls) {
        expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal)
      }
    } finally {
      timeoutSpy.mockRestore()
    }
  })

  it('returns a failure result when Slack user lookup times out', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('Request timed out after 15000ms', 'TimeoutError')
    )

    await expect(
      nudgePRAuthor('lookuptimeout', 'Fix: lookup timeout', 'https://github.com/pr/3')
    ).resolves.toEqual({
      success: false,
      error: 'Slack request failed: Request timed out after 15000ms',
    })
  })

  it('reports lookup HTTP failures without parsing a JSON error body', async () => {
    const json = vi.fn(async () => ({ ok: false, error: 'upstream_failure' }))
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502, json })

    await expect(
      nudgePRAuthor('lookuphttp', 'Fix: lookup HTTP failure', 'https://github.com/pr/3')
    ).resolves.toEqual({
      success: false,
      error: 'Slack request failed: Slack users.lookupByEmail failed with HTTP 502',
    })
    expect(json).not.toHaveBeenCalled()
  })

  it('reports conversation HTTP failures without parsing a non-JSON body', async () => {
    const json = vi.fn(async () => {
      throw new SyntaxError('Unexpected token <')
    })
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'UOPENHTTP' } }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503, json })

    await expect(
      nudgePRAuthor('openhttp', 'Fix: open HTTP failure', 'https://github.com/pr/3')
    ).resolves.toEqual({
      success: false,
      error: 'Slack request failed: Slack conversations.open failed with HTTP 503',
    })
    expect(json).not.toHaveBeenCalled()
  })

  it('reports message HTTP failures before parsing the response body', async () => {
    const json = vi.fn(async () => ({ ok: false, error: 'ratelimited' }))
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'UMSGHTTP' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: { id: 'DMSGHTTP' } }),
      })
      .mockResolvedValueOnce({ ok: false, status: 429, json })

    await expect(
      nudgePRAuthor('messagehttp', 'Fix: message HTTP failure', 'https://github.com/pr/3')
    ).resolves.toEqual({
      success: false,
      error: 'Slack request failed: Slack chat.postMessage failed with HTTP 429',
    })
    expect(json).not.toHaveBeenCalled()
  })

  it('returns a failure result when sending the Slack message times out', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'USENDTIMEOUT' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: { id: 'DSENDTIMEOUT' } }),
      })
      .mockRejectedValueOnce(new DOMException('Request timed out after 15000ms', 'TimeoutError'))

    await expect(
      nudgePRAuthor('sendtimeout', 'Fix: send timeout', 'https://github.com/pr/4')
    ).resolves.toEqual({
      success: false,
      error: 'Slack request failed: Request timed out after 15000ms',
    })
  })

  it('returns a failure result when opening the Slack conversation times out', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'UOPENTIMEOUT' } }),
      })
      .mockRejectedValueOnce(new DOMException('Request timed out after 15000ms', 'TimeoutError'))

    await expect(
      nudgePRAuthor('opentimeout', 'Fix: open timeout', 'https://github.com/pr/5')
    ).resolves.toEqual({
      success: false,
      error: 'Slack request failed: Request timed out after 15000ms',
    })
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

  it('preserves useful Slack application errors from user lookup', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'invalid_auth' }),
    })

    await expect(nudgePRAuthor('lookupappfail', 'Fix', 'https://github.com/pr/1')).resolves.toEqual(
      {
        success: false,
        error: 'Slack request failed: Slack users.lookupByEmail failed: invalid_auth',
      }
    )
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

  it('tries the next corporate pattern after a transient rate limit on the first', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValueOnce('\n')

    // First corporate pattern is rate limited; second resolves the user.
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, json: vi.fn(async () => ({})) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, user: { id: 'URATELIMIT' } }),
      })
      // conversations.open
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: { id: 'DRATELIMIT' } }),
      })
      // chat.postMessage
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    const result = await nudgePRAuthor('ratelimited', 'Fix', 'https://github.com/pr/1')
    expect(result).toEqual({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it('reports a lookup miss when every corporate pattern hits transient server errors', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValueOnce('\n')

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 502, json: vi.fn(async () => ({})) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: vi.fn(async () => ({})) })

    await expect(nudgePRAuthor('servererrors', 'Fix', 'https://github.com/pr/1')).resolves.toEqual({
      success: false,
      error:
        'Could not find Slack user for GitHub login "servererrors". Their GitHub email may not match their Slack email.',
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('surfaces permanent HTTP failures from corporate pattern lookups without retrying', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValueOnce('\n')

    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: vi.fn(async () => ({})) })

    await expect(nudgePRAuthor('permafail', 'Fix', 'https://github.com/pr/1')).resolves.toEqual({
      success: false,
      error: 'Slack request failed: Slack users.lookupByEmail failed with HTTP 401',
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('surfaces network timeouts during corporate pattern lookups without retrying', async () => {
    const { execSync } = await import('child_process')
    vi.mocked(execSync).mockReturnValueOnce('\n')

    mockFetch.mockRejectedValueOnce(
      new DOMException('Request timed out after 15000ms', 'TimeoutError')
    )

    await expect(
      nudgePRAuthor('patterntimeout', 'Fix', 'https://github.com/pr/1')
    ).resolves.toEqual({
      success: false,
      error: 'Slack request failed: Request timed out after 15000ms',
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
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
