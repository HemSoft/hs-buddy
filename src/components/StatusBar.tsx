import { useState, useEffect } from 'react'
import { GitPullRequest, Calendar, Clock, Bot, Zap, User, RefreshCw, CheckCircle2 } from 'lucide-react'
import type { BackgroundStatus } from '../hooks/useBackgroundStatus'
import './StatusBar.css'

interface StatusBarProps {
  prCount?: number
  scheduleCount?: number
  jobCount?: number
  activeGitHubAccount?: string | null
  backgroundStatus?: BackgroundStatus
}

export function StatusBar({
  prCount = 0,
  scheduleCount = 0,
  jobCount = 0,
  activeGitHubAccount,
  backgroundStatus,
}: StatusBarProps) {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {/* Pull Requests */}
        <div className="status-item" data-tooltip="GitHub Pull Requests">
          <span className="status-icon">
            <GitPullRequest size={12} />
          </span>
          <span className="status-text">{prCount} PRs</span>
        </div>

        <div className="status-divider" />

        {/* Schedules */}
        <div className="status-item" data-tooltip="Active Schedules">
          <span className="status-icon">
            <Calendar size={12} />
          </span>
          <span className="status-text">{scheduleCount} schedules</span>
        </div>

        <div className="status-divider" />

        {/* Jobs */}
        <div className="status-item" data-tooltip="Configured Jobs">
          <span className="status-icon">
            <Zap size={12} />
          </span>
          <span className="status-text">{jobCount} jobs</span>
        </div>

        {/* Active GitHub Account */}
        {activeGitHubAccount && (
          <>
            <div className="status-divider" />
            <div
              className="status-item status-item-github-account"
              data-tooltip="Active GitHub CLI Account (used for Copilot CLI, git operations)"
            >
              <span className="status-icon">
                <User size={12} />
              </span>
              <span className="status-text">@{activeGitHubAccount}</span>
            </div>
          </>
        )}

        {/* Background Sync Status */}
        {backgroundStatus && (
          <>
            <div className="status-divider" />
            {backgroundStatus.phase === 'syncing' ? (
              <div
                className="status-item status-item-syncing"
                data-tooltip={`Syncing: ${backgroundStatus.activeLabel || 'GitHub data'}${backgroundStatus.activeTasks > 1 ? ` (${backgroundStatus.activeTasks} tasks)` : ''}`}
              >
                <span className="status-icon spinning">
                  <RefreshCw size={12} />
                </span>
                <span className="status-text">
                  Syncing{backgroundStatus.activeLabel ? ` ${backgroundStatus.activeLabel}` : ''}...
                </span>
              </div>
            ) : (
              <div
                className="status-item status-item-sync-idle"
                data-tooltip={`Last updated ${backgroundStatus.lastRefreshedLabel || 'never'} · Next refresh in ${backgroundStatus.nextRefreshLabel || '—'}`}
              >
                <span className="status-icon">
                  <CheckCircle2 size={12} />
                </span>
                <span className="status-text">
                  {backgroundStatus.nextRefreshLabel
                    ? `Next sync ${backgroundStatus.nextRefreshLabel}`
                    : 'Auto-refresh active'}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="status-bar-center">
        {/* Buddy branding */}
        <div className="status-item status-item-brand" data-tooltip="hs-buddy">
          <span className="status-icon">
            <Bot size={12} />
          </span>
          <span className="status-text">Buddy</span>
        </div>
      </div>

      <div className="status-bar-right">
        {/* Date */}
        <div className="status-item" data-tooltip="Current Date">
          <span className="status-icon">
            <Calendar size={12} />
          </span>
          <span className="status-text">{formatDate(currentTime)}</span>
        </div>
        <div className="status-divider" />
        {/* Time */}
        <div className="status-item status-item-time" data-tooltip="Current Time">
          <span className="status-icon">
            <Clock size={12} />
          </span>
          <span className="status-text">{formatTime(currentTime)}</span>
        </div>
      </div>
    </div>
  )
}
