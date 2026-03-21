import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useExternalMarkdownLinks(containerRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      const anchor = target.closest('a')
      if (!(anchor instanceof HTMLAnchorElement) || !container.contains(anchor)) {
        return
      }

      const href = anchor.getAttribute('href')?.trim()
      if (!href || !/^(https?:|mailto:)/i.test(href)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      void window.shell.openExternal(href)
    }

    container.addEventListener('click', handleClick)
    return () => {
      container.removeEventListener('click', handleClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
