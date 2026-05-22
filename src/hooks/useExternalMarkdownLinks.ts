import { useEffect, type RefObject } from 'react'

function resolveExternalMarkdownHref(
  target: EventTarget | null,
  container: HTMLElement
): string | null {
  if (!(target instanceof HTMLElement)) {
    return null
  }

  const anchor = target.closest('a')
  if (!(anchor instanceof HTMLAnchorElement) || !container.contains(anchor)) {
    return null
  }

  const href = anchor.getAttribute('href')?.trim()
  if (!href || !/^(https?:|mailto:)/i.test(href)) {
    return null
  }

  return href
}

export function useExternalMarkdownLinks(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleClick = (event: MouseEvent) => {
      const href = resolveExternalMarkdownHref(event.target, container)
      if (!href) {
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
