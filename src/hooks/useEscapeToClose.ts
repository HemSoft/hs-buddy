import { useEffect } from 'react'

/** Closes a context menu (or similar overlay) on Escape key press. */
export function useEscapeToClose(isOpen: boolean, close: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      /* v8 ignore start */
      if (e.key === 'Escape') close()
      /* v8 ignore stop */
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])
}
