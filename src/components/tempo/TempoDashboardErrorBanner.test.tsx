import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TempoDashboardErrorBanner } from './TempoDashboardErrorBanner'

describe('TempoDashboardErrorBanner', () => {
  it('displays the error message', () => {
    render(
      <TempoDashboardErrorBanner
        error="Request failed"
        canRetry={false}
        onRetry={() => {}}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText(/Request failed/)).toBeInTheDocument()
  })

  it('shows a Retry button when canRetry is true', () => {
    const onRetry = vi.fn()
    render(
      <TempoDashboardErrorBanner
        error="Oops"
        canRetry={true}
        onRetry={onRetry}
        onDismiss={() => {}}
      />
    )
    const btn = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(btn)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows a Dismiss button when canRetry is false', () => {
    const onDismiss = vi.fn()
    render(
      <TempoDashboardErrorBanner
        error="Oops"
        canRetry={false}
        onRetry={() => {}}
        onDismiss={onDismiss}
      />
    )
    const btn = screen.getByRole('button', { name: 'Dismiss' })
    fireEvent.click(btn)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('does not render Retry when canRetry is false', () => {
    render(
      <TempoDashboardErrorBanner
        error="Oops"
        canRetry={false}
        onRetry={() => {}}
        onDismiss={() => {}}
      />
    )
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('does not render Dismiss when canRetry is true', () => {
    render(
      <TempoDashboardErrorBanner
        error="Oops"
        canRetry={true}
        onRetry={() => {}}
        onDismiss={() => {}}
      />
    )
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })
})
