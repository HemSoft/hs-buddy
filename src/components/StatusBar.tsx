import { useState, useEffect } from 'react'
import {
  GitPullRequest,
  Calendar,
  Clock,
  Bot,
  Zap,
  User,
  RefreshCw,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import type { BackgroundStatus } from '../hooks/useBackgroundStatus'
import { formatTime } from '../utils/dateUtils'
import './StatusBar.css'

interface StatusBarProps {
  prCount?: number
  scheduleCount?: number
  jobCount?: number
  activeGitHubAccount?: string | null
  backgroundStatus?: BackgroundStatus
  onNavigate?: (viewId: string) => void
  assistantActive?: boolean
}

export function StatusBar({
  prCount = 0,
  scheduleCount = 0,
  jobCount = 0,
  activeGitHubAccount,
  backgroundStatus,
  onNavigate,
  assistantActive,
}: StatusBarProps) {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

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
        <div
          className="status-item status-item-clickable"
          data-tooltip="View Pull Requests"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate?.('pr-my-prs')}
          onKeyDown={e => e.key === 'Enter' && onNavigate?.('pr-my-prs')}
        >
          <span className="status-icon">
            <GitPullRequest size={12} />
          </span>
          <span className="status-text">{prCount} PRs</span>
        </div>

        <div className="status-divider" />

        {/* Schedules */}
        <div
          className="status-item status-item-clickable"
          data-tooltip="View Schedules"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate?.('automation-schedules')}
          onKeyDown={e => e.key === 'Enter' && onNavigate?.('automation-schedules')}
        >
          <span className="status-icon">
            <Calendar size={12} />
          </span>
          <span className="status-text">{scheduleCount} schedules</span>
        </div>

        <div className="status-divider" />

        {/* Jobs */}
        <div
          className="status-item status-item-clickable"
          data-tooltip="View Jobs"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate?.('automation-runs')}
          onKeyDown={e => e.key === 'Enter' && onNavigate?.('automation-runs')}
        >
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
              className="status-item status-item-github-account status-item-clickable"
              data-tooltip="View Account Settings"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate?.('settings-accounts')}
              onKeyDown={e => e.key === 'Enter' && onNavigate?.('settings-accounts')}
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
                data-tooltip={`Syncing ${backgroundStatus.activeLabel || 'GitHub data'}${backgroundStatus.activeTasks > 1 ? ` — ${backgroundStatus.activeTasks} tasks remaining` : ''}`}
              >
                <span className="status-icon spinning">
                  <RefreshCw size={12} />
                </span>
                <span className="status-text">
                  {backgroundStatus.activeTasks > 1
                    ? `${backgroundStatus.activeTasks} remaining · ${backgroundStatus.activeLabel || 'Syncing'}...`
                    : `${backgroundStatus.activeLabel || 'Syncing'}...`}
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
        {/* Copilot Assistant indicator */}
        {assistantActive && (
          <div className="status-item status-item-copilot" data-tooltip="Copilot Assistant active">
            <span className="status-icon">
              <Sparkles size={12} />
            </span>
            <span className="status-text">Copilot</span>
          </div>
        )}

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
          <span className="status-text">{formatTime(currentTime, { seconds: true })}</span>
        </div>
      </div>
    </div>
  )
}
