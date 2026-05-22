import { useEffect, type RefObject } from 'react'

function findAnchorInContainer(
  target: EventTarget | null,
  container: HTMLElement
): HTMLAnchorElement | null {
  if (!(target instanceof HTMLElement)) return null
  const anchor = target.closest('a')
  if (!(anchor instanceof HTMLAnchorElement)) return null
  if (!container.contains(anchor)) return null
  return anchor
}

function isExternalUrl(href: string | undefined): href is string {
  return !!href && /^(https?:|mailto:)/i.test(href)
}

function resolveExternalHref(target: EventTarget | null, container: HTMLElement): string | null {
  const anchor = findAnchorInContainer(target, container)
  if (!anchor) return null
  const href = anchor.getAttribute('href')?.trim()
  if (!isExternalUrl(href)) return null
  return href
}

export function useExternalMarkdownLinks(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleClick = (event: MouseEvent) => {
      const href = resolveExternalHref(event.target, container)
      if (!href) return
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
