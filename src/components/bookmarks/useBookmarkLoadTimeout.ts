import { useEffect, useState } from 'react'

export const BOOKMARK_LOAD_TIMEOUT_MS = 10_000

export function useBookmarkLoadTimeout(isLoading: boolean): boolean {
  const [loadTimedOut, setLoadTimedOut] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setLoadTimedOut(false)
      return
    }

    const timer = window.setTimeout(() => {
      setLoadTimedOut(true)
    }, BOOKMARK_LOAD_TIMEOUT_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [isLoading])

  return loadTimedOut
}
