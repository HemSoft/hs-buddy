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
  type LucideIcon,
} from 'lucide-react'
import type { BackgroundStatus } from '../hooks/useBackgroundStatus'
import { formatTime } from '../utils/dateUtils'
import './StatusBar.css'

interface StatusBarItemProps {
  icon: LucideIcon
  text: string
  tooltip: string
  onClick?: () => void
  className?: string
}

function StatusBarItem({ icon: Icon, text, tooltip, onClick, className = '' }: StatusBarItemProps) {
  const content = (
    <>
      <span className="status-icon">
        <Icon size={12} />
      </span>
      <span className="status-text">{text}</span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={`status-item status-item-clickable ${className}`.trim()}
        data-tooltip={tooltip}
        onClick={onClick}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={`status-item ${className}`.trim()} data-tooltip={tooltip}>
      {content}
    </div>
  )
}

interface StatusBarProps {
  prCount?: number
  scheduleCount?: number
  jobCount?: number
  activeGitHubAccount?: string | null
  backgroundStatus?: BackgroundStatus
  onNavigate?: (viewId: string) => void
  assistantActive?: boolean
}

function buildSyncingTooltip(status: BackgroundStatus): string {
  const label = status.activeLabel || 'GitHub data'
  const suffix = status.activeTasks > 1 ? ` — ${status.activeTasks} tasks remaining` : ''
  return `Syncing ${label}${suffix}`
}

function buildSyncingLabel(status: BackgroundStatus): string {
  const label = status.activeLabel || 'Syncing'
  return status.activeTasks > 1 ? `${status.activeTasks} remaining · ${label}...` : `${label}...`
}

function buildIdleTooltip(status: BackgroundStatus): string {
  const last = status.lastRefreshedLabel || 'never'
  const next = status.nextRefreshLabel || '—'
  return `Last updated ${last} · Next refresh in ${next}`
}

function BackgroundSyncStatus({ backgroundStatus }: { backgroundStatus: BackgroundStatus }) {
  if (backgroundStatus.phase === 'syncing') {
    return (
      <div
        className="status-item status-item-syncing"
        data-tooltip={buildSyncingTooltip(backgroundStatus)}
      >
        <span className="status-icon spinning">
          <RefreshCw size={12} />
        </span>
        <span className="status-text">{buildSyncingLabel(backgroundStatus)}</span>
      </div>
    )
  }

  return (
    <div
      className="status-item status-item-sync-idle"
      data-tooltip={buildIdleTooltip(backgroundStatus)}
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
  )
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
        <StatusBarItem
          icon={GitPullRequest}
          text={`${prCount} PRs`}
          tooltip="View Pull Requests"
          onClick={() => onNavigate?.('pr-my-prs')}
        />

        <div className="status-divider" />

        <StatusBarItem
          icon={Calendar}
          text={`${scheduleCount} schedules`}
          tooltip="View Schedules"
          onClick={() => onNavigate?.('automation-schedules')}
        />

        <div className="status-divider" />

        <StatusBarItem
          icon={Zap}
          text={`${jobCount} jobs`}
          tooltip="View Jobs"
          onClick={() => onNavigate?.('automation-runs')}
        />

        {activeGitHubAccount && (
          <>
            <div className="status-divider" />
            <StatusBarItem
              icon={User}
              text={`@${activeGitHubAccount}`}
              tooltip="View Account Settings"
              onClick={() => onNavigate?.('settings-accounts')}
              className="status-item-github-account"
            />
          </>
        )}

        {/* Background Sync Status */}
        {backgroundStatus && (
          <>
            <div className="status-divider" />
            <BackgroundSyncStatus backgroundStatus={backgroundStatus} />
          </>
        )}
      </div>

      <div className="status-bar-center">
        {/* Copilot Assistant indicator */}
        {assistantActive && (
          <StatusBarItem
            icon={Sparkles}
            text="Copilot"
            tooltip="Copilot Assistant active"
            className="status-item-copilot"
          />
        )}

        {/* Buddy branding */}
        <StatusBarItem icon={Bot} text="Buddy" tooltip="hs-buddy" className="status-item-brand" />
      </div>

      <div className="status-bar-right">
        <StatusBarItem icon={Calendar} text={formatDate(currentTime)} tooltip="Current Date" />
        <div className="status-divider" />
        <StatusBarItem
          icon={Clock}
          text={formatTime(currentTime, { seconds: true })}
          tooltip="Current Time"
          className="status-item-time"
        />
      </div>
    </div>
  )
}
