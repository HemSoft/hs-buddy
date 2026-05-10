import { describe, expect, it, vi } from 'vitest'
import {
  SFL_STATUS_LABELS,
  handleItemKeyDown,
  sidebarItemClass,
  refreshStateClass,
} from './repoNodeUtils'

describe('SFL_STATUS_LABELS', () => {
  it('maps all known statuses', () => {
    expect(SFL_STATUS_LABELS.healthy).toBe('Healthy')
    expect(SFL_STATUS_LABELS['active-work']).toBe('Active work')
    expect(SFL_STATUS_LABELS.blocked).toBe('Blocked')
    expect(SFL_STATUS_LABELS['ready-for-review']).toBe('Ready for review')
    expect(SFL_STATUS_LABELS['recent-failure']).toBe('Recent failure')
    expect(SFL_STATUS_LABELS.unknown).toBe('Unknown')
  })
})

describe('handleItemKeyDown', () => {
  function createKeyEvent(key: string) {
    return {
      key,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent
  }

  it('calls action on Enter', () => {
    const action = vi.fn()
    const event = createKeyEvent('Enter')
    handleItemKeyDown(event, action)
    expect(action).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('calls action on Space', () => {
    const action = vi.fn()
    const event = createKeyEvent(' ')
    handleItemKeyDown(event, action)
    expect(action).toHaveBeenCalledOnce()
  })

  it('does not call action on other keys', () => {
    const action = vi.fn()
    const event = createKeyEvent('Tab')
    handleItemKeyDown(event, action)
    expect(action).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('stops propagation when flag is set', () => {
    const action = vi.fn()
    const event = createKeyEvent('Enter')
    handleItemKeyDown(event, action, true)
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('does not stop propagation by default', () => {
    const action = vi.fn()
    const event = createKeyEvent('Enter')
    handleItemKeyDown(event, action)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})

describe('sidebarItemClass', () => {
  it('returns base class when not selected', () => {
    expect(sidebarItemClass('repo-item', false)).toBe('repo-item')
  })

  it('appends selected when selected', () => {
    expect(sidebarItemClass('repo-item', true)).toBe('repo-item selected')
  })
})

describe('refreshStateClass', () => {
  it('returns active class', () => {
    expect(refreshStateClass('active')).toBe('refresh-active')
  })

  it('returns pending class', () => {
    expect(refreshStateClass('pending')).toBe('refresh-pending')
  })

  it('returns empty for unknown state', () => {
    expect(refreshStateClass('other')).toBe('')
  })

  it('returns empty for undefined', () => {
    expect(refreshStateClass(undefined)).toBe('')
  })
})
