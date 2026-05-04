/**
 * Mock convex/react module for E2E testing.
 *
 * When running in E2E mode (--mode e2e), Vite aliases 'convex/react' to this
 * file. This prevents the real Convex client from attempting WebSocket connections
 * to a non-existent server, while keeping all hooks functional (they return
 * undefined/loading state).
 */
import { type ReactNode, createElement } from 'react'

// Mock ConvexReactClient — no-op class
export class ConvexReactClient {
  url: string
  constructor(url: string) {
    this.url = url
  }
  close() {}
}

// Mock ConvexProvider — just renders children
export function ConvexProvider({ children }: { client: unknown; children: ReactNode }) {
  return createElement('div', { 'data-testid': 'convex-provider' }, children)
}

// Mock useQuery — always returns undefined (loading state)
export function useQuery() {
  return undefined
}

// Mock useMutation — returns a no-op async function
export function useMutation() {
  return async () => {}
}

// Mock useConvex — returns a minimal client mock
export function useConvex() {
  return {
    query: async () => undefined,
    mutation: async () => undefined,
  }
}

// Mock useAction
export function useAction() {
  return async () => undefined
}
