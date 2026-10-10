import { describe, expect, it, vi } from 'vitest'
import { handleItemKeyDown, sidebarItemClass, refreshStateClass } from './repoNodeUtils'

describe('handleItemKeyDown', () => {
  it('calls the action on Enter', () => {
    const action = vi.fn()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    handleItemKeyDown(event as unknown as React.KeyboardEvent, action)
    expect(action).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('calls the action on Space', () => {
    const action = vi.fn()
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    handleItemKeyDown(event as unknown as React.KeyboardEvent, action)
    expect(action).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does nothing for other keys', () => {
    const action = vi.fn()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    handleItemKeyDown(event as unknown as React.KeyboardEvent, action)
    expect(action).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('stops propagation when requested', () => {
    const action = vi.fn()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const stopPropagation = vi.spyOn(event, 'stopPropagation')
    handleItemKeyDown(event as unknown as React.KeyboardEvent, action, true)
    expect(stopPropagation).toHaveBeenCalledOnce()
  })

  it('does not stop propagation by default', () => {
    const action = vi.fn()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const stopPropagation = vi.spyOn(event, 'stopPropagation')
    handleItemKeyDown(event as unknown as React.KeyboardEvent, action)
    expect(stopPropagation).not.toHaveBeenCalled()
  })
})

describe('sidebarItemClass', () => {
  it('appends "selected" when isSelected is true', () => {
    expect(sidebarItemClass('sidebar-item', true)).toBe('sidebar-item selected')
  })

  it('returns base class only when not selected', () => {
    expect(sidebarItemClass('sidebar-item', false)).toBe('sidebar-item')
  })
})

describe('refreshStateClass', () => {
  it('returns "refresh-active" for active state', () => {
    expect(refreshStateClass('active')).toBe('refresh-active')
  })

  it('returns "refresh-pending" for pending state', () => {
    expect(refreshStateClass('pending')).toBe('refresh-pending')
  })

  it('returns empty string for unknown state', () => {
    expect(refreshStateClass('other')).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(refreshStateClass(undefined)).toBe('')
  })
})
