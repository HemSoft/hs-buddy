import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { PremiumUsageBadge } from './PremiumUsageBadge'

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'github', {
    value: {
      getCopilotQuota: vi.fn().mockResolvedValue({
        success: true,
        data: {
          quota_snapshots: {
            premium_interactions: {
              percent_remaining: 75,
              remaining: 750,
              entitlement: 1000,
            },
          },
        },
      }),
    },
    writable: true,
    configurable: true,
  })
})

describe('PremiumUsageBadge', () => {
  it('renders nothing when loading', () => {
    // Never resolve the promise to keep it in loading state
    vi.mocked(window.github.getCopilotQuota).mockReturnValue(new Promise(() => {}))
    const { container } = render(<PremiumUsageBadge username="testuser" />)
    expect(container.querySelector('.premium-usage-badge')).toBeNull()
  })

  it('renders badge after data loads', async () => {
    const { container } = render(<PremiumUsageBadge username="testuser" />)
    await waitFor(() => {
      expect(container.querySelector('.premium-usage-badge')).toBeTruthy()
    })
  })

  it('shows usage percentage in tooltip', async () => {
    const { container } = render(<PremiumUsageBadge username="testuser" />)
    await waitFor(() => {
      const badge = container.querySelector('.premium-usage-badge')
      expect(badge?.getAttribute('title')).toContain('25.0% used')
    })
  })

  it('renders nothing on error', async () => {
    vi.mocked(window.github.getCopilotQuota).mockRejectedValue(new Error('fail'))
    const { container } = render(<PremiumUsageBadge username="error-user" />)
    // Wait for the error to be processed
    await new Promise(r => setTimeout(r, 50))
    expect(container.querySelector('.premium-usage-badge')).toBeNull()
  })

  it('renders nothing with no username', () => {
    const { container } = render(<PremiumUsageBadge username="" />)
    expect(container.querySelector('.premium-usage-badge')).toBeNull()
  })
})
