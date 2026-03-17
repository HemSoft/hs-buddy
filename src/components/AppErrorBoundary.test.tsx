import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppErrorBoundary } from './AppErrorBoundary'

interface ThrowingChildProps {
  message?: string
  shouldThrow?: boolean
}

function ThrowingChild({ message = 'Test error', shouldThrow = true }: ThrowingChildProps) {
  if (shouldThrow) {
    throw new Error(message)
  }

  return <div>Safe content</div>
}

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('renders children when no error occurs', () => {
    render(
      <AppErrorBoundary>
        <div>Hello World</div>
      </AppErrorBoundary>
    )

    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders fallback UI when a child component throws', () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('displays the error message in the fallback', () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>
    )

    expect(screen.getByText('Test error')).toBeInTheDocument()
  })

  it('shows "Unknown render error" when the error has no message', () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild message="" />
      </AppErrorBoundary>
    )

    expect(screen.getByText('Unknown render error')).toBeInTheDocument()
  })

  it('shows retry guidance in the fallback', () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>
    )

    expect(screen.getByText('Please select another item and come back to retry.')).toBeInTheDocument()
  })

  it('resets error state when resetKey changes', () => {
    const { rerender } = render(
      <AppErrorBoundary resetKey="key-1">
        <ThrowingChild />
      </AppErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    rerender(
      <AppErrorBoundary resetKey="key-2">
        <div>Recovered content</div>
      </AppErrorBoundary>
    )

    expect(screen.getByText('Recovered content')).toBeInTheDocument()
  })

  it('does not reset error state when resetKey stays the same', () => {
    const { rerender } = render(
      <AppErrorBoundary resetKey="same-key">
        <ThrowingChild />
      </AppErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    rerender(
      <AppErrorBoundary resetKey="same-key">
        <div>Should not appear</div>
      </AppErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument()
  })

  it('logs the error via console.error with the AppErrorBoundary prefix', () => {
    render(
      <AppErrorBoundary>
        <ThrowingChild />
      </AppErrorBoundary>
    )

    const boundaryLog = consoleErrorSpy.mock.calls.find((call: unknown[]) => {
      const [firstArg] = call
      return typeof firstArg === 'string' && firstArg.includes('[AppErrorBoundary]')
    })

    expect(boundaryLog).toBeDefined()
  })
})
