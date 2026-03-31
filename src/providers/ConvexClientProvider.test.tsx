import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

type MockConvexProviderProps = {
  children: ReactNode
  client: { url: string }
}
const mockConvexProvider = vi.fn(({ children }: MockConvexProviderProps) => (
  <div data-testid="convex-provider">{children}</div>
))
const mockConvexReactClient = vi.fn(
  class MockConvexReactClient {
    url: string

    constructor(url: string) {
      this.url = url
    }
  }
)

vi.mock('convex/react', () => ({
  ConvexProvider: mockConvexProvider,
  ConvexReactClient: mockConvexReactClient,
}))

async function importProviderWithUrl(url?: string) {
  vi.resetModules()

  if (url === undefined) {
    vi.stubEnv('VITE_CONVEX_URL', '')
  } else {
    vi.stubEnv('VITE_CONVEX_URL', url)
  }

  return import('./ConvexClientProvider')
}

describe('ConvexClientProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('renders children when the Convex URL is configured', async () => {
    const { ConvexClientProvider } = await importProviderWithUrl('https://buddy.convex.cloud')

    render(
      <ConvexClientProvider>
        <span>Connected child</span>
      </ConvexClientProvider>
    )

    expect(screen.getByTestId('convex-provider')).toBeTruthy()
    expect(screen.getByText('Connected child')).toBeTruthy()
    expect(mockConvexReactClient).toHaveBeenCalledWith('https://buddy.convex.cloud')
    expect(mockConvexProvider.mock.calls[0][0].client.url).toBe('https://buddy.convex.cloud')
  })

  it('throws a helpful error when the Convex URL is missing', async () => {
    await expect(importProviderWithUrl()).rejects.toThrow(/VITE_CONVEX_URL is not set/)
  })
})
