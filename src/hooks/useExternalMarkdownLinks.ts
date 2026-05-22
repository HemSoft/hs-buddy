import { useEffect, type RefObject } from 'react'

function resolveMarkdownAnchor(
  target: EventTarget | null,
  container: HTMLElement
): HTMLAnchorElement | null {
  if (!(target instanceof HTMLElement)) {
    return null
  }

  const anchor = target.closest('a')
  if (!(anchor instanceof HTMLAnchorElement)) {
    return null
  }

  return container.contains(anchor) ? anchor : null
}

function readExternalMarkdownHref(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute('href')?.trim()
  if (!href) {
    return null
  }

  return /^(https?:|mailto:)/i.test(href) ? href : null
}

function resolveExternalMarkdownHref(
  target: EventTarget | null,
  container: HTMLElement
): string | null {
  const anchor = resolveMarkdownAnchor(target, container)
  if (!anchor) {
    return null
  }

  return readExternalMarkdownHref(anchor)
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
