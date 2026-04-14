import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { SFLOverallStatus } from '../../../types/sflStatus'
import {
  SFL_STATUS_LABELS,
  sflOverallStatusIcon,
  sflWorkflowStateIcon,
  handleItemKeyDown,
} from './repoNodeUtils'

describe('SFL_STATUS_LABELS', () => {
  it('maps all SFL statuses to labels', () => {
    const statuses: SFLOverallStatus[] = [
      'healthy',
      'active-work',
      'blocked',
      'ready-for-review',
      'recent-failure',
      'unknown',
    ]

    for (const status of statuses) {
      expect(SFL_STATUS_LABELS[status]).toBeTypeOf('string')
      expect(SFL_STATUS_LABELS[status].length).toBeGreaterThan(0)
    }
  })

  it('has correct label values', () => {
    expect(SFL_STATUS_LABELS.healthy).toBe('Healthy')
    expect(SFL_STATUS_LABELS['active-work']).toBe('Active work')
    expect(SFL_STATUS_LABELS.blocked).toBe('Blocked')
    expect(SFL_STATUS_LABELS['ready-for-review']).toBe('Ready for review')
    expect(SFL_STATUS_LABELS['recent-failure']).toBe('Recent failure')
    expect(SFL_STATUS_LABELS.unknown).toBe('Unknown')
  })
})

describe('sflOverallStatusIcon', () => {
  it('renders success icon for healthy status', () => {
    const { container } = render(sflOverallStatusIcon('healthy'))
    expect(container.querySelector('.sfl-status-success')).not.toBeNull()
  })

  it('renders info icon for active-work status', () => {
    const { container } = render(sflOverallStatusIcon('active-work'))
    expect(container.querySelector('.sfl-status-info')).not.toBeNull()
  })

  it('renders warning icon for blocked status', () => {
    const { container } = render(sflOverallStatusIcon('blocked'))
    expect(container.querySelector('.sfl-status-warning')).not.toBeNull()
  })

  it('renders info icon for ready-for-review status', () => {
    const { container } = render(sflOverallStatusIcon('ready-for-review'))
    expect(container.querySelector('.sfl-status-info')).not.toBeNull()
  })

  it('renders error icon for recent-failure status', () => {
    const { container } = render(sflOverallStatusIcon('recent-failure'))
    expect(container.querySelector('.sfl-status-error')).not.toBeNull()
  })

  it('renders muted icon for unknown status', () => {
    const { container } = render(sflOverallStatusIcon('unknown'))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })

  it('renders muted icon for unrecognized status', () => {
    const { container } = render(sflOverallStatusIcon('garbage' as SFLOverallStatus))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })
})

describe('sflWorkflowStateIcon', () => {
  it('renders muted icon for inactive state', () => {
    const { container } = render(sflWorkflowStateIcon('disabled', null))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })

  it('renders muted icon for active state with no conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', null))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })

  it('renders success icon for active state with success conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'success'))
    expect(container.querySelector('.sfl-status-success')).not.toBeNull()
  })

  it('renders error icon for active state with failure conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'failure'))
    expect(container.querySelector('.sfl-status-error')).not.toBeNull()
  })

  it('renders error icon for active state with timed_out conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'timed_out'))
    expect(container.querySelector('.sfl-status-error')).not.toBeNull()
  })

  it('renders muted icon for active state with skipped conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'skipped'))
    expect(container.querySelector('.sfl-status-muted')).not.toBeNull()
  })

  it('renders info icon for active state with unknown conclusion', () => {
    const { container } = render(sflWorkflowStateIcon('active', 'in_progress'))
    expect(container.querySelector('.sfl-status-info')).not.toBeNull()
  })
})

describe('handleItemKeyDown', () => {
  it('calls action on Enter key', () => {
    const action = vi.fn()
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action)
    expect(action).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('calls action on Space key', () => {
    const action = vi.fn()
    const event = {
      key: ' ',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action)
    expect(action).toHaveBeenCalledOnce()
  })

  it('does nothing for other keys', () => {
    const action = vi.fn()
    const event = {
      key: 'Tab',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action)
    expect(action).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('stops propagation when stopPropagation flag is true', () => {
    const action = vi.fn()
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action, true)
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  })

  it('does not stop propagation by default', () => {
    const action = vi.fn()
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent

    handleItemKeyDown(event, action)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})
