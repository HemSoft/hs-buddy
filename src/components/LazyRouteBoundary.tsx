import { Suspense, type ReactNode } from 'react'
import { AppErrorBoundary } from './AppErrorBoundary'

type LazyRouteBoundaryProps = {
  routeKey: string
  children: ReactNode
}

export function LazyRouteBoundary({ routeKey, children }: LazyRouteBoundaryProps) {
  return (
    <AppErrorBoundary resetKey={routeKey}>
      <Suspense
        fallback={
          <div className="content-placeholder" role="status" aria-live="polite">
            <div className="content-body">
              <p>Loading feature…</p>
            </div>
          </div>
        }
      >
        {children}
      </Suspense>
    </AppErrorBoundary>
  )
}
