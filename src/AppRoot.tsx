import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ConvexClientProvider } from './providers/ConvexClientProvider'

function StartupErrorFallback({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="app startup-error">
      <div className="content-placeholder">
        <div className="content-header">
          <h1>Buddy couldn't start</h1>
        </div>
        <div className="content-body">
          <p>The app hit an error while loading.</p>
          <pre className="startup-error-details">{message}</pre>
          <button type="button" className="startup-error-retry" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppRoot() {
  return (
    <AppErrorBoundary
      fallback={({ message, reset }) => <StartupErrorFallback message={message} retry={reset} />}
    >
      <ConvexClientProvider>
        <App />
      </ConvexClientProvider>
    </AppErrorBoundary>
  )
}
