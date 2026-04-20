import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  PanelLoadingState,
  PanelErrorState,
  InlineRefreshIndicator,
  PanelEmptyState,
} from './PanelStates'

describe('PanelLoadingState', () => {
  it('renders default loading message', () => {
    render(<PanelLoadingState />)
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders custom message', () => {
    render(<PanelLoadingState message="Loading commits..." />)
    expect(screen.getByText('Loading commits...')).toBeDefined()
  })

  it('renders subtitle when provided', () => {
    render(<PanelLoadingState message="Loading..." subtitle="owner/repo" />)
    expect(screen.getByText('owner/repo')).toBeDefined()
  })

  it('does not render subtitle when not provided', () => {
    const { container } = render(<PanelLoadingState />)
    expect(container.querySelector('.panel-loading-sub')).toBeNull()
  })

  it('applies custom className', () => {
    const { container } = render(<PanelLoadingState className="custom-class" />)
    expect(container.firstElementChild?.classList.contains('custom-class')).toBe(true)
    expect(container.firstElementChild?.classList.contains('panel-loading')).toBe(true)
  })
})

describe('PanelErrorState', () => {
  it('renders error message and detail', () => {
    render(<PanelErrorState error="Network timeout" />)
    expect(screen.getByText('Failed to load')).toBeDefined()
    expect(screen.getByText('Network timeout')).toBeDefined()
  })

  it('renders custom title', () => {
    render(<PanelErrorState title="Failed to load repository" error="404 Not Found" />)
    expect(screen.getByText('Failed to load repository')).toBeDefined()
  })

  it('renders retry button when onRetry is provided', () => {
    const onRetry = vi.fn()
    render(<PanelErrorState error="Error" onRetry={onRetry} />)
    const btn = screen.getByRole('button', { name: /retry/i })
    expect(btn).toBeDefined()
    fireEvent.click(btn)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not render retry button when onRetry is not provided', () => {
    render(<PanelErrorState error="Error" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('applies custom className', () => {
    const { container } = render(<PanelErrorState error="Error" className="my-error" />)
    expect(container.firstElementChild?.classList.contains('my-error')).toBe(true)
    expect(container.firstElementChild?.classList.contains('panel-error')).toBe(true)
  })
})

describe('InlineRefreshIndicator', () => {
  it('renders default message', () => {
    render(<InlineRefreshIndicator />)
    expect(screen.getByText('Refreshing...')).toBeDefined()
  })

  it('renders custom message', () => {
    render(<InlineRefreshIndicator message="Refreshing commits..." />)
    expect(screen.getByText('Refreshing commits...')).toBeDefined()
  })

  it('has role="status" for accessibility', () => {
    render(<InlineRefreshIndicator />)
    expect(screen.getByRole('status')).toBeDefined()
  })
})

describe('PanelEmptyState', () => {
  it('renders icon, message, and subtitle', () => {
    render(
      <PanelEmptyState
        icon={<span data-testid="icon">🔍</span>}
        message="No items found"
        subtitle="Try a different search"
      />
    )
    expect(screen.getByTestId('icon')).toBeDefined()
    expect(screen.getByText('No items found')).toBeDefined()
    expect(screen.getByText('Try a different search')).toBeDefined()
  })

  it('does not render subtitle when not provided', () => {
    const { container } = render(<PanelEmptyState icon={<span>📦</span>} message="Empty" />)
    expect(container.querySelector('.empty-subtitle')).toBeNull()
  })
})
