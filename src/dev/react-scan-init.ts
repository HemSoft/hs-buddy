/**
 * React Scan — Development-only render performance monitoring
 *
 * Provides visual overlays highlighting component re-renders in the app.
 * Only active when BOTH conditions are met:
 *   1. Running in development mode (import.meta.env.DEV)
 *   2. VITE_REACT_SCAN=1 environment variable is set
 *
 * Usage:
 *   Set VITE_REACT_SCAN=1 in your .env.local or shell before starting dev:
 *     VITE_REACT_SCAN=1 bun run dev
 *
 * This replaces why-did-you-render (incompatible with React 19) with a
 * modern alternative that provides similar re-render visibility.
 */
import { scan } from 'react-scan'

export function initReactScan(): void {
  scan({
    enabled: true,
    log: true,
  })
}
