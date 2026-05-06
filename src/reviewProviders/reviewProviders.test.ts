import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copilotProvider } from './copilotProvider'
import { codeRabbitProvider, clearCodeRabbitDetectionCache } from './codeRabbitProvider'
import {
  allProviders,
  detectAvailableProviders,
  getProviderById,
  clearAvailabilityCache,
} from './registry'
import type { GitHubClient } from '../api/github'

function mockClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    listPRReviews: vi.fn().mockResolvedValue([]),
    requestCopilotReview: vi.fn().mockResolvedValue(undefined),
    addPRComment: vi.fn().mockResolvedValue({
      id: 'comment-1',
      body: '',
      author: '',
      authorAvatarUrl: null,
      bodyHtml: null,
      createdAt: '',
      updatedAt: '',
      url: '',
      diffHunk: null,
      reactions: [],
    }),
    listPRIssueComments: vi.fn().mockResolvedValue([]),
    checkFileExists: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as GitHubClient
}

describe('copilotProvider', () => {
  it('has correct metadata', () => {
    expect(copilotProvider.id).toBe('copilot')
    expect(copilotProvider.name).toBe('Copilot')
    expect(copilotProvider.botLogin).toBe('copilot-pull-request-reviewer[bot]')
    expect(copilotProvider.capabilities.canTrigger).toBe(true)
    expect(copilotProvider.capabilities.canMonitor).toBe(true)
  })

  it('detect always returns true', async () => {
    const client = mockClient()
    expect(await copilotProvider.detect(client, 'owner', 'repo')).toBe(true)
  })

  it('trigger calls requestCopilotReview', async () => {
    const client = mockClient()
    await copilotProvider.trigger(client, 'org', 'repo', 42)
    expect(client.requestCopilotReview).toHaveBeenCalledWith('org', 'repo', 42)
  })

  it('getCheckpoint returns max review ID from bot', async () => {
    const client = mockClient({
      listPRReviews: vi.fn().mockResolvedValue([
        {
          id: 10,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'APPROVED',
          submitted_at: null,
        },
        { id: 5, user: { login: 'human' }, state: 'APPROVED', submitted_at: null },
        {
          id: 20,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
      ]),
    })
    const checkpoint = await copilotProvider.getCheckpoint(client, 'org', 'repo', 42)
    expect(checkpoint).toEqual({ maxReviewId: 20 })
  })

  it('poll returns completed when a fresh review exists', async () => {
    const client = mockClient({
      listPRReviews: vi.fn().mockResolvedValue([
        {
          id: 25,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
      ]),
    })
    const result = await copilotProvider.poll(client, 'org', 'repo', 42, { maxReviewId: 20 })
    expect(result.status).toBe('completed')
  })

  it('poll returns pending when no fresh review', async () => {
    const client = mockClient({
      listPRReviews: vi.fn().mockResolvedValue([
        {
          id: 20,
          user: { login: 'copilot-pull-request-reviewer[bot]' },
          state: 'COMMENTED',
          submitted_at: null,
        },
      ]),
    })
    const result = await copilotProvider.poll(client, 'org', 'repo', 42, { maxReviewId: 20 })
    expect(result.status).toBe('pending')
  })
})

describe('codeRabbitProvider', () => {
  beforeEach(() => {
    clearCodeRabbitDetectionCache()
  })

  it('has correct metadata', () => {
    expect(codeRabbitProvider.id).toBe('coderabbit')
    expect(codeRabbitProvider.name).toBe('CodeRabbit')
    expect(codeRabbitProvider.botLogin).toBe('coderabbitai[bot]')
    expect(codeRabbitProvider.capabilities.canTrigger).toBe(true)
  })

  it('detect returns true when .coderabbit.yaml exists', async () => {
    const client = mockClient({ checkFileExists: vi.fn().mockResolvedValue(true) })
    expect(await codeRabbitProvider.detect(client, 'org', 'repo')).toBe(true)
  })

  it('detect returns false when .coderabbit.yaml does not exist', async () => {
    const client = mockClient({ checkFileExists: vi.fn().mockResolvedValue(false) })
    expect(await codeRabbitProvider.detect(client, 'org', 'repo')).toBe(false)
  })

  it('detect caches results per repo', async () => {
    const checkFn = vi.fn().mockResolvedValue(true)
    const client = mockClient({ checkFileExists: checkFn })
    await codeRabbitProvider.detect(client, 'org', 'repo')
    await codeRabbitProvider.detect(client, 'org', 'repo')
    expect(checkFn).toHaveBeenCalledTimes(1)
  })

  it('trigger posts @coderabbitai full review comment', async () => {
    const client = mockClient()
    await codeRabbitProvider.trigger(client, 'org', 'repo', 42)
    expect(client.addPRComment).toHaveBeenCalledWith('org', 'repo', 42, '@coderabbitai full review')
  })

  it('getCheckpoint returns max comment ID from bot', async () => {
    const client = mockClient({
      listPRIssueComments: vi.fn().mockResolvedValue([
        {
          id: 100,
          user: { login: 'coderabbitai[bot]' },
          body: 'some comment',
          created_at: '2024-01-01',
        },
        { id: 50, user: { login: 'human' }, body: 'hello', created_at: '2024-01-01' },
        {
          id: 200,
          user: { login: 'coderabbitai[bot]' },
          body: 'another',
          created_at: '2024-01-02',
        },
      ]),
    })
    const checkpoint = (await codeRabbitProvider.getCheckpoint(client, 'org', 'repo', 42)) as {
      maxCommentId: number
    }
    expect(checkpoint.maxCommentId).toBe(200)
  })

  it('poll returns completed when a walkthrough comment appears', async () => {
    const client = mockClient({
      listPRIssueComments: vi.fn().mockResolvedValue([
        {
          id: 300,
          user: { login: 'coderabbitai[bot]' },
          body: '## Walkthrough\nChanges to file X',
          created_at: '2024-01-03',
        },
      ]),
    })
    const result = await codeRabbitProvider.poll(client, 'org', 'repo', 42, {
      maxCommentId: 200,
      triggeredAt: '2024-01-02T00:00:00Z',
    })
    expect(result.status).toBe('completed')
  })

  it('poll returns completed for Summary by CodeRabbit', async () => {
    const client = mockClient({
      listPRIssueComments: vi.fn().mockResolvedValue([
        {
          id: 300,
          user: { login: 'coderabbitai[bot]' },
          body: '## Summary by CodeRabbit\n...',
          created_at: '2024-01-03',
        },
      ]),
    })
    const result = await codeRabbitProvider.poll(client, 'org', 'repo', 42, {
      maxCommentId: 200,
      triggeredAt: '2024-01-02T00:00:00Z',
    })
    expect(result.status).toBe('completed')
  })

  it('poll returns pending when no completed review comment', async () => {
    const client = mockClient({
      listPRIssueComments: vi.fn().mockResolvedValue([
        {
          id: 300,
          user: { login: 'coderabbitai[bot]' },
          body: 'Processing...',
          created_at: '2024-01-03',
        },
      ]),
    })
    const result = await codeRabbitProvider.poll(client, 'org', 'repo', 42, {
      maxCommentId: 200,
      triggeredAt: '2024-01-02T00:00:00Z',
    })
    expect(result.status).toBe('pending')
  })

  it('poll returns pending when no new bot comments at all', async () => {
    const client = mockClient({
      listPRIssueComments: vi.fn().mockResolvedValue([
        {
          id: 200,
          user: { login: 'coderabbitai[bot]' },
          body: '## Walkthrough\nold',
          created_at: '2024-01-01',
        },
      ]),
    })
    const result = await codeRabbitProvider.poll(client, 'org', 'repo', 42, {
      maxCommentId: 200,
      triggeredAt: '2024-01-02T00:00:00Z',
    })
    expect(result.status).toBe('pending')
  })
})

describe('registry', () => {
  beforeEach(() => {
    clearAvailabilityCache()
    clearCodeRabbitDetectionCache()
  })

  it('allProviders contains both providers', () => {
    expect(allProviders).toHaveLength(2)
    expect(allProviders.map(p => p.id)).toEqual(['copilot', 'coderabbit'])
  })

  it('getProviderById finds a provider', () => {
    expect(getProviderById('copilot')).toBe(copilotProvider)
    expect(getProviderById('coderabbit')).toBe(codeRabbitProvider)
    expect(getProviderById('unknown')).toBeUndefined()
  })

  it('detectAvailableProviders returns only available providers', async () => {
    const client = mockClient({ checkFileExists: vi.fn().mockResolvedValue(false) })
    const available = await detectAvailableProviders(client, 'org', 'repo')
    // Copilot always available, CodeRabbit not (no yaml)
    expect(available.map(p => p.id)).toEqual(['copilot'])
  })

  it('detectAvailableProviders returns CodeRabbit when yaml exists', async () => {
    const client = mockClient({ checkFileExists: vi.fn().mockResolvedValue(true) })
    const available = await detectAvailableProviders(client, 'org', 'repo')
    expect(available.map(p => p.id)).toEqual(['copilot', 'coderabbit'])
  })

  it('detectAvailableProviders caches results', async () => {
    const checkFn = vi.fn().mockResolvedValue(true)
    const client = mockClient({ checkFileExists: checkFn })
    await detectAvailableProviders(client, 'org', 'repo')
    await detectAvailableProviders(client, 'org', 'repo')
    // Detection should only call once (cached)
    expect(checkFn).toHaveBeenCalledTimes(1)
  })

  it('detectAvailableProviders treats detection errors as unavailable', async () => {
    const client = mockClient({ checkFileExists: vi.fn().mockRejectedValue(new Error('network')) })
    const available = await detectAvailableProviders(client, 'org', 'repo')
    expect(available.map(p => p.id)).toEqual(['copilot'])
  })

  it('detectAvailableProviders returns cached false without re-detecting', async () => {
    const checkFn = vi.fn().mockResolvedValue(false)
    const client = mockClient({ checkFileExists: checkFn })
    // First call — detect returns false, cache stores false
    const first = await detectAvailableProviders(client, 'org', 'cache-false-repo')
    expect(first.map(p => p.id)).toEqual(['copilot'])

    // Second call — should use cached false, not call detect again
    const second = await detectAvailableProviders(client, 'org', 'cache-false-repo')
    expect(second.map(p => p.id)).toEqual(['copilot'])
    // Only called once per provider for 'cache-false-repo' (CodeRabbit's detect)
    expect(checkFn).toHaveBeenCalledTimes(1)
  })
})
