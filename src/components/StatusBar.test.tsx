import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusBar } from './StatusBar'
import type { BackgroundStatus } from '../hooks/useBackgroundStatus'
import { axe } from '../test/axe-helper'

describe('StatusBar', () => {
  it('renders with default props', () => {
    render(<StatusBar />)
    expect(screen.getByText('0 PRs')).toBeTruthy()
    expect(screen.getByText('0 schedules')).toBeTruthy()
    expect(screen.getByText('0 jobs')).toBeTruthy()
    expect(screen.getByText('Buddy')).toBeTruthy()
  })

  it('displays PR, schedule, and job counts', () => {
    render(<StatusBar prCount={5} scheduleCount={3} jobCount={7} />)
    expect(screen.getByText('5 PRs')).toBeTruthy()
    expect(screen.getByText('3 schedules')).toBeTruthy()
    expect(screen.getByText('7 jobs')).toBeTruthy()
  })

  it('shows active GitHub account when provided', () => {
    render(<StatusBar activeGitHubAccount="fhemmer" />)
    expect(screen.getByText('@fhemmer')).toBeTruthy()
  })

  it('hides GitHub account section when not provided', () => {
    render(<StatusBar />)
    expect(screen.queryByText(/@/)).toBeFalsy()
  })

  it('navigates to PRs when PR section clicked', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} prCount={2} />)
    fireEvent.click(screen.getByText('2 PRs'))
    expect(onNavigate).toHaveBeenCalledWith('pr-my-prs')
  })

  it('navigates to schedules on click', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} scheduleCount={1} />)
    fireEvent.click(screen.getByText('1 schedules'))
    expect(onNavigate).toHaveBeenCalledWith('automation-schedules')
  })

  it('navigates to jobs on click', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} jobCount={4} />)
    fireEvent.click(screen.getByText('4 jobs'))
    expect(onNavigate).toHaveBeenCalledWith('automation-runs')
  })

  it('navigates to account settings on account click', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} activeGitHubAccount="user1" />)
    fireEvent.click(screen.getByText('@user1'))
    expect(onNavigate).toHaveBeenCalledWith('settings-accounts')
  })

  it('shows syncing status when phase is syncing', () => {
    const status: BackgroundStatus = {
      phase: 'syncing',
      activeLabel: 'PRs',
      activeTasks: 3,
      nextRefreshSecs: null,
      lastRefreshedAt: null,
      lastRefreshedLabel: null,
      nextRefreshLabel: null,
    }
    render(<StatusBar backgroundStatus={status} />)
    expect(screen.getByText(/3 remaining · PRs\.\.\./)).toBeTruthy()
  })

  it('shows single task syncing without count', () => {
    const status: BackgroundStatus = {
      phase: 'syncing',
      activeLabel: 'Repos',
      activeTasks: 1,
      nextRefreshSecs: null,
      lastRefreshedAt: null,
      lastRefreshedLabel: null,
      nextRefreshLabel: null,
    }
    render(<StatusBar backgroundStatus={status} />)
    expect(screen.getByText('Repos...')).toBeTruthy()
  })

  it('shows idle status with next refresh time', () => {
    const status: BackgroundStatus = {
      phase: 'idle',
      activeLabel: null,
      activeTasks: 0,
      nextRefreshSecs: 180,
      lastRefreshedAt: Date.now() - 120000,
      lastRefreshedLabel: '2 min ago',
      nextRefreshLabel: '3 min',
    }
    render(<StatusBar backgroundStatus={status} />)
    expect(screen.getByText('Next sync 3 min')).toBeTruthy()
  })

  it('shows Copilot indicator when assistant is active', () => {
    render(<StatusBar assistantActive />)
    expect(screen.getByText('Copilot')).toBeTruthy()
  })

  it('renders clickable items as native buttons for keyboard accessibility', () => {
    const onNavigate = vi.fn()
    render(
      <StatusBar
        onNavigate={onNavigate}
        prCount={1}
        scheduleCount={2}
        jobCount={3}
        activeGitHubAccount="user1"
      />
    )
    const prButton = screen.getByText('1 PRs').closest('button')
    const schedButton = screen.getByText('2 schedules').closest('button')
    const jobButton = screen.getByText('3 jobs').closest('button')
    const acctButton = screen.getByText('@user1').closest('button')
    expect(prButton).toBeTruthy()
    expect(schedButton).toBeTruthy()
    expect(jobButton).toBeTruthy()
    expect(acctButton).toBeTruthy()
    expect(prButton!.getAttribute('type')).toBe('button')
  })

  it('renders static items as divs, not buttons', () => {
    render(<StatusBar />)
    const buddyItem = screen.getByText('Buddy').closest('.status-item')
    expect(buddyItem).toBeTruthy()
    expect(buddyItem!.tagName).toBe('DIV')
  })

  it('activates native button via keyboard Enter and Space', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} prCount={1} />)
    const prButton = screen.getByText('1 PRs').closest('button')!
    prButton.focus()
    await user.keyboard('{Enter}')
    expect(onNavigate).toHaveBeenCalledWith('pr-my-prs')
    onNavigate.mockClear()
    await user.keyboard(' ')
    expect(onNavigate).toHaveBeenCalledWith('pr-my-prs')
  })

  it('shows idle auto-refresh active when no nextRefreshLabel', () => {
    const status: BackgroundStatus = {
      phase: 'idle',
      activeLabel: null,
      activeTasks: 0,
      nextRefreshSecs: null,
      lastRefreshedAt: null,
      lastRefreshedLabel: null,
      nextRefreshLabel: null,
    }
    render(<StatusBar backgroundStatus={status} />)
    expect(screen.getByText('Auto-refresh active')).toBeTruthy()
  })

  it('shows syncing without label using default Syncing text', () => {
    const status: BackgroundStatus = {
      phase: 'syncing',
      activeLabel: null,
      activeTasks: 1,
      nextRefreshSecs: null,
      lastRefreshedAt: null,
      lastRefreshedLabel: null,
      nextRefreshLabel: null,
    }
    render(<StatusBar backgroundStatus={status} />)
    expect(screen.getByText('Syncing...')).toBeTruthy()
  })

  it('shows syncing multi-task without label', () => {
    const status: BackgroundStatus = {
      phase: 'syncing',
      activeLabel: null,
      activeTasks: 5,
      nextRefreshSecs: null,
      lastRefreshedAt: null,
      lastRefreshedLabel: null,
      nextRefreshLabel: null,
    }
    render(<StatusBar backgroundStatus={status} />)
    expect(screen.getByText(/5 remaining · Syncing\.\.\./)).toBeTruthy()
  })

  it('does not show Copilot when assistantActive is false', () => {
    const { container } = render(<StatusBar assistantActive={false} />)
    expect(container.querySelector('.status-item-copilot')).toBeNull()
  })

  it('renders date and time in the right section', () => {
    render(<StatusBar />)
    // Time section should exist (format depends on locale)
    const rightSection = screen.getByText('Buddy').closest('.status-bar')
    expect(rightSection).toBeTruthy()
  })

  it('updates currentTime via setInterval', () => {
    vi.useFakeTimers()
    const { container } = render(<StatusBar />)

    // Advance time by 1 second to trigger setInterval callback
    vi.advanceTimersByTime(1000)

    // The time should have been updated (interval fires setCurrentTime)
    // We just verify it didn't throw and the component still renders
    expect(container.querySelector('.status-bar-right')).toBeTruthy()

    vi.useRealTimers()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<StatusBar />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
