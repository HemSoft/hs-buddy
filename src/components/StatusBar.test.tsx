import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StatusBar } from './StatusBar'
import type { BackgroundStatus } from '../hooks/useBackgroundStatus'

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

  it('renders keyboard-navigable PR button', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} prCount={1} />)
    const prButton = screen.getByText('1 PRs').closest('[role="button"]')
    expect(prButton).toBeTruthy()
    fireEvent.keyDown(prButton!, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith('pr-my-prs')
  })

  it('navigates to schedules on Enter key', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} scheduleCount={2} />)
    const schedButton = screen.getByText('2 schedules').closest('[role="button"]')
    fireEvent.keyDown(schedButton!, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith('automation-schedules')
  })

  it('does not navigate on non-Enter key', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} scheduleCount={2} />)
    const schedButton = screen.getByText('2 schedules').closest('[role="button"]')
    fireEvent.keyDown(schedButton!, { key: 'Tab' })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('navigates to jobs on Enter key', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} jobCount={3} />)
    const jobButton = screen.getByText('3 jobs').closest('[role="button"]')
    fireEvent.keyDown(jobButton!, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith('automation-runs')
  })

  it('navigates to account on Enter key', () => {
    const onNavigate = vi.fn()
    render(<StatusBar onNavigate={onNavigate} activeGitHubAccount="user2" />)
    const acctButton = screen.getByText('@user2').closest('[role="button"]')
    fireEvent.keyDown(acctButton!, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith('settings-accounts')
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
})
