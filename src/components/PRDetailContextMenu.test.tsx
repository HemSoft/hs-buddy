import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PRDetailContextMenu } from './PRDetailContextMenu'

function renderMenu(overrides: Record<string, unknown> = {}) {
  const props = {
    x: 100,
    y: 200,
    youApproved: false,
    copilotReviewState: 'idle',
    nudgeState: 'idle' as const,
    onRequestCopilotReview: vi.fn(),
    onApprove: vi.fn(),
    onNudge: vi.fn(),
    onRefresh: vi.fn(),
    onCopyLink: vi.fn(),
    onOpenExternal: vi.fn(),
    onStartRalphReview: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  return { ...render(<PRDetailContextMenu {...props} />), props }
}

describe('PRDetailContextMenu', () => {
  it('renders all menu buttons', () => {
    renderMenu()
    expect(screen.getByText('Request Copilot Review')).toBeInTheDocument()
    expect(screen.getByText('Start Ralph PR Review')).toBeInTheDocument()
    expect(screen.getByText('Approve')).toBeInTheDocument()
    expect(screen.getByText('Nudge Author via Slack')).toBeInTheDocument()
    expect(screen.getByText('Refresh')).toBeInTheDocument()
    expect(screen.getByText('Copy Link')).toBeInTheDocument()
    expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
  })

  it('calls handler for each button', () => {
    const { props } = renderMenu()
    fireEvent.click(screen.getByText('Request Copilot Review'))
    expect(props.onRequestCopilotReview).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Start Ralph PR Review'))
    expect(props.onStartRalphReview).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Approve'))
    expect(props.onApprove).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Refresh'))
    expect(props.onRefresh).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Copy Link'))
    expect(props.onCopyLink).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Open on GitHub'))
    expect(props.onOpenExternal).toHaveBeenCalled()
  })

  it('disables Copilot Review when state is not idle', () => {
    renderMenu({ copilotReviewState: 'pending' })
    expect(screen.getByText('Request Copilot Review').closest('button')).toBeDisabled()
  })

  it('enables Copilot Review when state is idle', () => {
    renderMenu({ copilotReviewState: 'idle' })
    expect(screen.getByText('Request Copilot Review').closest('button')).not.toBeDisabled()
  })

  it('shows "Already Approved" when youApproved is true', () => {
    renderMenu({ youApproved: true })
    expect(screen.getByText('Already Approved')).toBeInTheDocument()
    expect(screen.getByText('Already Approved').closest('button')).toBeDisabled()
  })

  it('disables nudge when sending', () => {
    renderMenu({ nudgeState: 'sending' })
    expect(screen.getByText('Nudge Author via Slack').closest('button')).toBeDisabled()
  })

  it('shows "Nudge Sent" when sent', () => {
    renderMenu({ nudgeState: 'sent' })
    expect(screen.getByText('Nudge Sent')).toBeInTheDocument()
    expect(screen.getByText('Nudge Sent').closest('button')).toBeDisabled()
  })

  it('enables nudge in error state', () => {
    renderMenu({ nudgeState: 'error' })
    expect(screen.getByText('Nudge Author via Slack').closest('button')).not.toBeDisabled()
  })

  it('calls onClose when overlay is clicked', () => {
    const { container, props } = renderMenu()
    const overlay = container.querySelector('.context-menu-overlay')!
    fireEvent.click(overlay)
    expect(props.onClose).toHaveBeenCalled()
  })

  it('renders AI review provider buttons with correct icons', () => {
    const providers = [
      {
        id: 'coderabbit',
        name: 'CodeRabbit',
        state: 'idle' as const,
        onRequest: vi.fn(),
      },
      {
        id: 'other-provider',
        name: 'Other AI',
        state: 'idle' as const,
        onRequest: vi.fn(),
      },
    ]
    renderMenu({ aiReviewProviders: providers })
    expect(screen.getByText('Request CodeRabbit Review')).toBeInTheDocument()
    expect(screen.getByText('Request Other AI Review')).toBeInTheDocument()
  })

  it('calls aiReviewProvider onRequest handler when clicked', () => {
    const onRequest = vi.fn()
    const providers = [
      {
        id: 'coderabbit',
        name: 'CodeRabbit',
        state: 'idle' as const,
        onRequest,
      },
    ]
    renderMenu({ aiReviewProviders: providers })
    fireEvent.click(screen.getByText('Request CodeRabbit Review'))
    expect(onRequest).toHaveBeenCalled()
  })

  it('disables AI review provider button when state is not idle', () => {
    const providers = [
      {
        id: 'coderabbit',
        name: 'CodeRabbit',
        state: 'monitoring' as const,
        onRequest: vi.fn(),
      },
    ]
    renderMenu({ aiReviewProviders: providers })
    expect(screen.getByText('Waiting for CodeRabbit\u2026').closest('button')).toBeDisabled()
  })

  it('shows completion text when AI review provider state is done', () => {
    const providers = [
      {
        id: 'coderabbit',
        name: 'CodeRabbit',
        state: 'done' as const,
        onRequest: vi.fn(),
      },
    ]
    renderMenu({ aiReviewProviders: providers })
    expect(screen.getByText('CodeRabbit review complete!')).toBeInTheDocument()
  })
})
