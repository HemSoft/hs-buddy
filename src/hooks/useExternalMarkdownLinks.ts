import { useEffect, type RefObject } from 'react'

function isExternalProtocol(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href)
}

function findContainedAnchor(
  target: HTMLElement,
  container: HTMLElement
): HTMLAnchorElement | null {
  const anchor = target.closest('a')
  if (!(anchor instanceof HTMLAnchorElement) || !container.contains(anchor)) {
    return null
  }
  return anchor
}

function resolveOpenableExternalHref(
  target: EventTarget | null,
  container: HTMLElement
): string | null {
  if (!(target instanceof HTMLElement)) {
    return null
  }

  const anchor = findContainedAnchor(target, container)
  const href = anchor?.getAttribute('href')?.trim()
  if (!href || !isExternalProtocol(href)) {
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
      const href = resolveOpenableExternalHref(event.target, container)
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
