import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import {
  SFL_STATUS_LABELS,
  sflOverallStatusIcon,
  sflWorkflowStateIcon,
  handleItemKeyDown,
  sidebarItemClass,
  refreshStateClass,
} from './repoNodeUtils'
import type { SFLOverallStatus } from '../../../types/sflStatus'

describe('SFL_STATUS_LABELS', () => {
  it('maps every SFLOverallStatus to a human-readable label', () => {
    const statuses: SFLOverallStatus[] = [
      'healthy',
      'active-work',
      'blocked',
      'ready-for-review',
      'recent-failure',
      'unknown',
    ]
    for (const s of statuses) {
      expect(SFL_STATUS_LABELS[s]).toBeDefined()
      expect(typeof SFL_STATUS_LABELS[s]).toBe('string')
    }
  })
})

describe('sflOverallStatusIcon', () => {
  it('renders an icon for each known status', () => {
    const statuses: SFLOverallStatus[] = [
      'healthy',
      'active-work',
      'blocked',
      'ready-for-review',
      'recent-failure',
      'unknown',
    ]
    for (const s of statuses) {
      const { container } = render(sflOverallStatusIcon(s))
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg?.classList.contains('sfl-status-icon')).toBe(true)
    }
  })

  it('falls back to the unknown icon for an unrecognized status', () => {
    const { container } = render(sflOverallStatusIcon('bogus' as SFLOverallStatus))
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })
})

describe('sflWorkflowStateIcon', () => {
  it('renders a muted icon for non-active state', () => {
    const { container } = render(sflWorkflowStateIcon('disabled', null))
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains('sfl-status-muted')).toBe(true)
  })

  it('renders a muted circle when active with no conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', null))
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains('sfl-status-muted')).toBe(true)
  })

  it('renders a success icon for "success" conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'success'))
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('sfl-status-success')).toBe(true)
  })

  it('renders an error icon for "failure" conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'failure'))
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('sfl-status-error')).toBe(true)
  })

  it('renders an error icon for "timed_out" conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'timed_out'))
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('sfl-status-error')).toBe(true)
  })

  it('renders a muted icon for "skipped" conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'skipped'))
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('sfl-status-muted')).toBe(true)
  })

  it('falls back to the default icon for an unknown conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'something_else'))
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('sfl-status-info')).toBe(true)
  })
})

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
