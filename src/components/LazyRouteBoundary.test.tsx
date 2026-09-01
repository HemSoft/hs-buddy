import { lazy } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LazyRouteBoundary } from './LazyRouteBoundary'

describe('LazyRouteBoundary', () => {
  it('shows the shared loading state while a route module is pending', () => {
    const PendingRoute = lazy(() => new Promise<never>(() => {}))

    render(
      <LazyRouteBoundary routeKey="pending-route">
        <PendingRoute />
      </LazyRouteBoundary>
    )

    expect(screen.getByRole('status')).toHaveTextContent('Loading feature…')
  })

  it('shows the shared error state when a route fails to render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    function BrokenRoute(): never {
      throw new Error('route failed')
    }

    render(
      <LazyRouteBoundary routeKey="broken-route">
        <BrokenRoute />
      </LazyRouteBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('route failed')).toBeInTheDocument()
  })
})
