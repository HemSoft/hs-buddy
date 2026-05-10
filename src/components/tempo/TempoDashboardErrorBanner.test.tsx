import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TempoDashboardErrorBanner } from './TempoDashboardErrorBanner'

describe('TempoDashboardErrorBanner', () => {
  it('displays the error message', () => {
    render(
      <TempoDashboardErrorBanner
        error="Connection failed"
        canRetry
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText(/Connection failed/)).toBeInTheDocument()
  })

  it('shows Retry button when canRetry is true', () => {
    const onRetry = vi.fn()
    render(
      <TempoDashboardErrorBanner error="Error" canRetry onRetry={onRetry} onDismiss={vi.fn()} />
    )
    const btn = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(btn)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows Dismiss button when canRetry is false', () => {
    const onDismiss = vi.fn()
    render(
      <TempoDashboardErrorBanner
        error="Error"
        canRetry={false}
        onRetry={vi.fn()}
        onDismiss={onDismiss}
      />
    )
    const btn = screen.getByRole('button', { name: 'Dismiss' })
    fireEvent.click(btn)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('does not show Dismiss when canRetry is true', () => {
    render(
      <TempoDashboardErrorBanner error="Error" canRetry onRetry={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })

  it('does not show Retry when canRetry is false', () => {
    render(
      <TempoDashboardErrorBanner
        error="Error"
        canRetry={false}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
