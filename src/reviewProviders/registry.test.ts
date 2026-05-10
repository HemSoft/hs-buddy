import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  allProviders,
  detectAvailableProviders,
  getProviderById,
  clearAvailabilityCache,
} from './registry'
import type { GitHubClient } from '../api/github'

// Minimal mock client
const mockClient = {} as GitHubClient

beforeEach(() => {
  clearAvailabilityCache()
  vi.restoreAllMocks()
})

describe('allProviders', () => {
  it('includes copilot and codeRabbit providers', () => {
    expect(allProviders).toHaveLength(2)
    expect(allProviders.map(p => p.id)).toEqual(['copilot', 'coderabbit'])
  })
})

describe('getProviderById', () => {
  it('finds copilot provider', () => {
    expect(getProviderById('copilot')?.id).toBe('copilot')
  })

  it('finds coderabbit provider', () => {
    expect(getProviderById('coderabbit')?.id).toBe('coderabbit')
  })

  it('returns undefined for unknown provider', () => {
    expect(getProviderById('nonexistent')).toBeUndefined()
  })
})

describe('detectAvailableProviders', () => {
  it('returns providers whose detect returns true', async () => {
    // Mock detect on each provider
    const spies = allProviders.map(p => vi.spyOn(p, 'detect').mockResolvedValue(true))

    const result = await detectAvailableProviders(mockClient, 'myorg', 'myrepo')
    expect(result).toHaveLength(2)

    spies.forEach(spy => spy.mockRestore())
  })

  it('excludes providers whose detect returns false', async () => {
    const copilotSpy = vi.spyOn(allProviders[0], 'detect').mockResolvedValue(true)
    const codeRabbitSpy = vi.spyOn(allProviders[1], 'detect').mockResolvedValue(false)

    const result = await detectAvailableProviders(mockClient, 'myorg', 'myrepo')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('copilot')

    copilotSpy.mockRestore()
    codeRabbitSpy.mockRestore()
  })

  it('caches detection results', async () => {
    const detectSpy = vi.spyOn(allProviders[0], 'detect').mockResolvedValue(true)
    vi.spyOn(allProviders[1], 'detect').mockResolvedValue(false)

    // First call — hits detect
    await detectAvailableProviders(mockClient, 'myorg', 'myrepo')
    expect(detectSpy).toHaveBeenCalledTimes(1)

    // Second call — uses cache
    await detectAvailableProviders(mockClient, 'myorg', 'myrepo')
    expect(detectSpy).toHaveBeenCalledTimes(1)

    // Different repo should not reuse the same cache entry
    await detectAvailableProviders(mockClient, 'myorg', 'another-repo')
    expect(detectSpy).toHaveBeenCalledTimes(2)
  })

  it('treats detection errors as unavailable', async () => {
    vi.spyOn(allProviders[0], 'detect').mockRejectedValue(new Error('API error'))
    vi.spyOn(allProviders[1], 'detect').mockResolvedValue(true)

    const result = await detectAvailableProviders(mockClient, 'myorg', 'myrepo')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('coderabbit')
  })

  it('clears cache and re-detects after clearAvailabilityCache', async () => {
    const detectSpy = vi.spyOn(allProviders[0], 'detect').mockResolvedValue(true)
    vi.spyOn(allProviders[1], 'detect').mockResolvedValue(false)

    await detectAvailableProviders(mockClient, 'myorg', 'myrepo')
    expect(detectSpy).toHaveBeenCalledTimes(1)

    clearAvailabilityCache()

    await detectAvailableProviders(mockClient, 'myorg', 'myrepo')
    expect(detectSpy).toHaveBeenCalledTimes(2)
  })
})
