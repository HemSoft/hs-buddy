import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryFallbackProps {
  error: Error | null
  message: string
  reset: () => void
}

interface AppErrorBoundaryProps {
  children: ReactNode
  fallback?: (props: AppErrorBoundaryFallbackProps) => ReactNode
  resetKey?: string | number | null
}

interface AppErrorBoundaryState {
  error: Error | null
  hasError: boolean
  message: string
}

function resolveBoundaryMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || 'Unknown render error'
  }
  if (typeof error === 'string' && error.length > 0) {
    return error
  }
  return 'Unknown render error'
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const normalizedError = error instanceof Error ? error : null
    return {
      error: normalizedError,
      hasError: true,
      message: resolveBoundaryMessage(error),
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[AppErrorBoundary] Render error:', error, errorInfo)
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps): void {
    if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
      this.resetError()
    }
  }

  private resetError = () => {
    this.setState({ error: null, hasError: false, message: '' })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback({
        error: this.state.error,
        message: this.state.message,
        reset: this.resetError,
      })
    }

    return (
      <div className="content-placeholder">
        <div className="content-header">
          <h2>Something went wrong</h2>
        </div>
        <div className="content-body">
          <p>{this.state.message}</p>
          <p>Please select another item and come back to retry.</p>
        </div>
      </div>
    )
  }
}
