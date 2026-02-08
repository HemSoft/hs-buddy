import {
  Users,
  GitPullRequest,
  Activity,
  FolderGit2,
  Play,
  Star,
  Calendar,
  Clock,
  Building2,
  Zap,
  Settings,
  Heart,
} from 'lucide-react'
import { useBuddyStats, useRepoBookmarks } from '../hooks/useConvex'
import './WelcomePanel.css'

interface WelcomePanelProps {
  prCounts: Record<string, number>
  onNavigate: (viewId: string) => void
  onSectionChange: (sectionId: string) => void
}

/** Format a large number with locale separators */
function formatNumber(n: number): string {
  return n.toLocaleString()
}

/** Format milliseconds into a human-readable uptime string */
function formatUptime(ms: number): string {
  if (ms <= 0) return '0m'
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

/** Format epoch ms to a short date like "Feb 2026" */
function formatMemberSince(epochMs: number): string {
  if (!epochMs) return 'Today'
  const date = new Date(epochMs)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function WelcomePanel({ prCounts, onNavigate, onSectionChange }: WelcomePanelProps) {
  const stats = useBuddyStats()

  // Derive values (handle loading state — stats is undefined while Convex loads)
  const totalPrsViewed = (stats?.prsViewed ?? 0) + (stats?.prsReviewed ?? 0) + (stats?.prsMergedWatched ?? 0)
  const activePrs = Object.values(prCounts).reduce((a, b) => a + b, 0)
  const reposBrowsed = stats?.reposBrowsed ?? 0
  const runsTriggered = stats?.runsTriggered ?? 0
  const runsCompleted = stats?.runsCompleted ?? 0
  const runsFailed = stats?.runsFailed ?? 0
  const repoBookmarks = useRepoBookmarks()
  const bookmarks = repoBookmarks?.length ?? 0
  const firstLaunch = stats?.firstLaunchDate ?? 0
  const appLaunches = stats?.appLaunches ?? 0
  const totalUptime = stats?.totalUptimeMs ?? 0

  // Success rate subtitle for runs
  const totalFinished = runsCompleted + runsFailed
  const successRate = totalFinished > 0 ? Math.round((runsCompleted / totalFinished) * 100) : 0

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'my-prs':
        onSectionChange('github')
        onNavigate('pr-my-prs')
        break
      case 'organizations':
        onSectionChange('github')
        break
      case 'jobs':
        onSectionChange('automation')
        onNavigate('automation-jobs')
        break
      case 'settings':
        onSectionChange('settings')
        onNavigate('settings-accounts')
        break
    }
  }

  return (
    <div className="welcome-panel">
      <div className="welcome-card">
        {/* Header */}
        <div className="welcome-header">
          <div className="welcome-icon">
            <Users size={48} strokeWidth={2.5} />
          </div>
          <h1 className="welcome-app-name">Buddy</h1>
          <div className="welcome-version-badge">Version 0.1.0</div>
          <div className="welcome-tagline">
            <span className="welcome-tagline-emoji">🤝</span>
            <span>Your Universal Productivity Companion</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="welcome-stats-grid">
          <div className="welcome-stat-card">
            <div className="welcome-stat-icon">
              <GitPullRequest size={20} />
            </div>
            <div className="welcome-stat-info">
              <span className="welcome-stat-value">{formatNumber(totalPrsViewed)}</span>
              <span className="welcome-stat-label">PRs Viewed</span>
            </div>
          </div>

          <div className="welcome-stat-card">
            <div className="welcome-stat-icon welcome-stat-icon-live">
              <Activity size={20} />
            </div>
            <div className="welcome-stat-info">
              <span className="welcome-stat-value">{formatNumber(activePrs)}</span>
              <span className="welcome-stat-label">Active PRs</span>
            </div>
          </div>

          <div className="welcome-stat-card">
            <div className="welcome-stat-icon">
              <FolderGit2 size={20} />
            </div>
            <div className="welcome-stat-info">
              <span className="welcome-stat-value">{formatNumber(reposBrowsed)}</span>
              <span className="welcome-stat-label">Repos Browsed</span>
            </div>
          </div>

          <div className="welcome-stat-card">
            <div className="welcome-stat-icon">
              <Play size={20} />
            </div>
            <div className="welcome-stat-info">
              <span className="welcome-stat-value">{formatNumber(runsTriggered)}</span>
              <span className="welcome-stat-label">Runs Executed</span>
              {totalFinished > 0 && (
                <span className="welcome-stat-subtitle">{successRate}% success</span>
              )}
            </div>
          </div>

          <div className="welcome-stat-card">
            <div className="welcome-stat-icon">
              <Star size={20} />
            </div>
            <div className="welcome-stat-info">
              <span className="welcome-stat-value">{formatNumber(bookmarks)}</span>
              <span className="welcome-stat-label">Bookmarks</span>
            </div>
          </div>

          <div className="welcome-stat-card">
            <div className="welcome-stat-icon">
              <Calendar size={20} />
            </div>
            <div className="welcome-stat-info">
              <span className="welcome-stat-value">{formatMemberSince(firstLaunch)}</span>
              <span className="welcome-stat-label">Member Since</span>
              {appLaunches > 0 && (
                <span className="welcome-stat-subtitle">
                  {formatNumber(appLaunches)} session{appLaunches !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Uptime Badge */}
        {totalUptime > 0 && (
          <div className="welcome-uptime-badge">
            <Clock size={14} />
            <span>{formatUptime(totalUptime)} total uptime</span>
          </div>
        )}

        {/* Quick Actions */}
        <div className="welcome-quick-actions">
          <button className="welcome-action-btn" onClick={() => handleQuickAction('my-prs')}>
            <GitPullRequest size={18} />
            <span>My PRs</span>
          </button>
          <button className="welcome-action-btn" onClick={() => handleQuickAction('organizations')}>
            <Building2 size={18} />
            <span>Organizations</span>
          </button>
          <button className="welcome-action-btn" onClick={() => handleQuickAction('jobs')}>
            <Zap size={18} />
            <span>Jobs</span>
          </button>
          <button className="welcome-action-btn" onClick={() => handleQuickAction('settings')}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>

        {/* Footer */}
        <div className="welcome-footer">
          <span>Made with</span>
          <Heart size={14} className="welcome-heart" />
          <span>by HemSoft Developments</span>
        </div>
      </div>
    </div>
  )
}
