import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useExternalMarkdownLinks } from './useExternalMarkdownLinks'

const mockOpenExternal = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'shell', {
    value: { openExternal: mockOpenExternal },
    writable: true,
    configurable: true,
  })
})

describe('useExternalMarkdownLinks', () => {
  it('opens external links in shell', () => {
    const container = document.createElement('div')
    container.innerHTML = '<a href="https://github.com">GitHub</a>'
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    const anchor = container.querySelector('a')!
    const event = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() })
    anchor.dispatchEvent(event)

    expect(mockOpenExternal).toHaveBeenCalledWith('https://github.com')
    document.body.removeChild(container)
  })

  it('ignores links without http/https/mailto protocol', () => {
    const container = document.createElement('div')
    container.innerHTML = '<a href="/local-path">Local</a>'
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    const anchor = container.querySelector('a')!
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(mockOpenExternal).not.toHaveBeenCalled()
    document.body.removeChild(container)
  })

  it('handles mailto links', () => {
    const container = document.createElement('div')
    container.innerHTML = '<a href="mailto:test@example.com">Email</a>'
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    const anchor = container.querySelector('a')!
    const event = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
    Object.defineProperty(event, 'stopPropagation', { value: vi.fn() })
    anchor.dispatchEvent(event)

    expect(mockOpenExternal).toHaveBeenCalledWith('mailto:test@example.com')
    document.body.removeChild(container)
  })

  it('ignores clicks on non-anchor elements', () => {
    const container = document.createElement('div')
    container.innerHTML = '<span>Not a link</span>'
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    const span = container.querySelector('span')!
    span.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(mockOpenExternal).not.toHaveBeenCalled()
    document.body.removeChild(container)
  })

  it('does nothing when ref is null', () => {
    renderHook(() => {
      const ref = useRef<HTMLElement>(null)
      useExternalMarkdownLinks(ref)
    })
    // No error thrown
    expect(mockOpenExternal).not.toHaveBeenCalled()
  })

  it('ignores click when target is not an HTMLElement', () => {
    const container = document.createElement('div')
    // Add an SVG element — SVGElement is NOT an instance of HTMLElement
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    container.appendChild(svg)
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    // Click on the SVG element; event.target is SVGElement (not HTMLElement)
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(mockOpenExternal).not.toHaveBeenCalled()
    document.body.removeChild(container)
  })

  it('ignores anchor outside the container', () => {
    const container = document.createElement('div')
    const outsideAnchor = document.createElement('a')
    outsideAnchor.href = 'https://outside.com'
    outsideAnchor.textContent = 'Outside'
    document.body.appendChild(container)
    document.body.appendChild(outsideAnchor)

    renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    // Click on an anchor that is NOT inside the container
    outsideAnchor.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(mockOpenExternal).not.toHaveBeenCalled()
    document.body.removeChild(container)
    document.body.removeChild(outsideAnchor)
  })

  it('ignores anchor with empty href', () => {
    const container = document.createElement('div')
    container.innerHTML = '<a href="">Empty</a>'
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    const anchor = container.querySelector('a')!
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(mockOpenExternal).not.toHaveBeenCalled()
    document.body.removeChild(container)
  })

  it('ignores anchor with no href attribute', () => {
    const container = document.createElement('div')
    container.innerHTML = '<a>No href</a>'
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    const anchor = container.querySelector('a')!
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(mockOpenExternal).not.toHaveBeenCalled()
    document.body.removeChild(container)
  })

  it('cleans up event listener on unmount', () => {
    const container = document.createElement('div')
    container.innerHTML = '<a href="https://example.com">Link</a>'
    document.body.appendChild(container)

    const { unmount } = renderHook(() => {
      const ref = useRef(container)
      useExternalMarkdownLinks(ref)
    })

    unmount()

    // After unmount, clicking should not open external
    const anchor = container.querySelector('a')!
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(mockOpenExternal).not.toHaveBeenCalled()
    document.body.removeChild(container)
  })
})
