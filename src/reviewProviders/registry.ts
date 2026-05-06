import type { GitHubClient } from '../api/github'
import type { AIReviewProvider } from './types'
import { copilotProvider } from './copilotProvider'
import { codeRabbitProvider } from './codeRabbitProvider'

/** All registered AI review providers, in display order. */
export const allProviders: readonly AIReviewProvider[] = [copilotProvider, codeRabbitProvider]

/**
 * Cache of detection results keyed by `${providerId}:${owner}/${repo}`.
 * Survives for the app session — cleared on window reload.
 */
const availabilityCache = new Map<string, boolean>()

function cacheKey(providerId: string, owner: string, repo: string): string {
  return `${providerId}:${owner}/${repo}`
}

/**
 * Detect which providers are available for a given repo.
 * Results are cached per provider+repo for the session lifetime.
 */
export async function detectAvailableProviders(
  client: GitHubClient,
  owner: string,
  repo: string
): Promise<AIReviewProvider[]> {
  const results = await Promise.all(
    allProviders.map(async provider => {
      const key = cacheKey(provider.id, owner, repo)
      const cached = availabilityCache.get(key)
      if (cached !== undefined) return cached ? provider : null

      try {
        const available = await provider.detect(client, owner, repo)
        availabilityCache.set(key, available)
        return available ? provider : null
      } catch (_: unknown) {
        // Detection failure = assume unavailable
        availabilityCache.set(key, false)
        return null
      }
    })
  )
  return results.filter((p): p is AIReviewProvider => p !== null)
}

/** Look up a provider by ID. */
export function getProviderById(id: string): AIReviewProvider | undefined {
  return allProviders.find(p => p.id === id)
}

/** Clear all detection caches (useful after config changes). */
export function clearAvailabilityCache(): void {
  availabilityCache.clear()
}
