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
import { useBackgroundStatus, type BackgroundStatus } from '../hooks/useBackgroundStatus'
import { formatDistanceToNow, formatSecondsCountdown, formatTime } from '../utils/dateUtils'
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
  const runningLabel = `${status.runningTasks} running`
  const queuedLabel = `${status.queuedTasks} queued`
  return `Syncing ${label} — ${runningLabel}, ${queuedLabel}`
}

function buildSyncingLabel(status: BackgroundStatus): string {
  const label = status.activeLabel || 'GitHub data'
  const taskCount = status.activeTasks > 1 ? ` · ${status.activeTasks} sync tasks` : ''
  return `Syncing ${label}${taskCount}…`
}

function buildIdleTooltip(
  lastRefreshedLabel: string | null,
  nextRefreshLabel: string | null
): string {
  const last = lastRefreshedLabel || 'never'
  const next = nextRefreshLabel || '—'
  return `Last updated ${last} · Next refresh in ${next}`
}

function useCurrentTime(enabled = true): Date {
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    if (!enabled) return
    setCurrentTime(new Date())
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [enabled])

  return currentTime
}

function BackgroundSyncStatus({ backgroundStatus }: { backgroundStatus: BackgroundStatus }) {
  const currentTime = useCurrentTime(backgroundStatus.phase === 'idle')

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

  const now = currentTime.getTime()
  const nextRefreshSecs = backgroundStatus.nextRefreshAt
    ? Math.max(0, Math.ceil((backgroundStatus.nextRefreshAt - now) / 1000))
    : null
  const nextRefreshLabel = nextRefreshSecs === null ? null : formatSecondsCountdown(nextRefreshSecs)
  const lastRefreshedLabel = backgroundStatus.lastRefreshedAt
    ? formatDistanceToNow(backgroundStatus.lastRefreshedAt)
    : null

  return (
    <div
      className="status-item status-item-sync-idle"
      data-tooltip={buildIdleTooltip(lastRefreshedLabel, nextRefreshLabel)}
    >
      <span className="status-icon">
        <CheckCircle2 size={12} />
      </span>
      <span className="status-text">
        {nextRefreshLabel ? `Next sync ${nextRefreshLabel}` : 'Auto-refresh active'}
      </span>
    </div>
  )
}

function GitHubAccountItem({
  activeGitHubAccount,
  onNavigate,
}: {
  activeGitHubAccount?: string | null
  onNavigate?: (viewId: string) => void
}) {
  if (!activeGitHubAccount) return null
  return (
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
  )
}

function LiveBackgroundSyncStatus() {
  const backgroundStatus = useBackgroundStatus()
  return <BackgroundSyncStatus backgroundStatus={backgroundStatus} />
}

function BackgroundSyncSection({ backgroundStatus }: { backgroundStatus?: BackgroundStatus }) {
  return (
    <>
      <div className="status-divider" />
      {backgroundStatus ? (
        <BackgroundSyncStatus backgroundStatus={backgroundStatus} />
      ) : (
        <LiveBackgroundSyncStatus />
      )}
    </>
  )
}

function CopilotStatusItem({ assistantActive }: { assistantActive?: boolean }) {
  if (!assistantActive) return null
  return (
    <StatusBarItem
      icon={Sparkles}
      text="Copilot"
      tooltip="Copilot Assistant active"
      className="status-item-copilot"
    />
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

        <GitHubAccountItem activeGitHubAccount={activeGitHubAccount} onNavigate={onNavigate} />
        <BackgroundSyncSection backgroundStatus={backgroundStatus} />
      </div>

      <div className="status-bar-center">
        <CopilotStatusItem assistantActive={assistantActive} />
        <StatusBarItem icon={Bot} text="Buddy" tooltip="hs-buddy" className="status-item-brand" />
      </div>

      <StatusBarClock />
    </div>
  )
}

function StatusBarClock() {
  const currentTime = useCurrentTime()
  const currentDate = currentTime.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="status-bar-right">
      <StatusBarItem icon={Calendar} text={currentDate} tooltip="Current Date" />
      <div className="status-divider" />
      <StatusBarItem
        icon={Clock}
        text={formatTime(currentTime, { seconds: true })}
        tooltip="Current Time"
        className="status-item-time"
      />
    </div>
  )
}
