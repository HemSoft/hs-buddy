import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MarkdownContent } from './MarkdownContent'

vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="md">{source}</div>,
}))

describe('MarkdownContent', () => {
  it('renders markdown source inside a dark-mode wrapper', () => {
    const { container } = render(<MarkdownContent source="# Hello" className="my-class" />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-color-mode')).toBe('dark')
    expect(wrapper.className).toBe('my-class')
    expect(wrapper.textContent).toContain('# Hello')
  })

  it('renders without className when not provided', () => {
    const { container } = render(<MarkdownContent source="text" />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute('data-color-mode')).toBe('dark')
    expect(wrapper.className).toBeFalsy()
  })
})
