import { useState, useEffect } from 'react'
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
  Sparkles,
  RefreshCw,
  ArrowRight,
} from 'lucide-react'
import { useBuddyStats, useRepoBookmarks } from '../hooks/useConvex'
import { useCopilotUsage } from '../hooks/useCopilotUsage'
import { formatCurrency } from './copilot-usage/quotaUtils'
import './WelcomePanel.css'

interface WelcomePanelProps {
  prCounts: Record<string, number>
  onNavigate: (viewId: string) => void
  onSectionChange: (sectionId: string) => void
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1_000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

function formatMemberSince(epochMs: number): string {
  if (!epochMs) return 'Today'
  const date = new Date(epochMs)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function WelcomePanel({ prCounts, onNavigate, onSectionChange }: WelcomePanelProps) {
  const stats = useBuddyStats()
  const { accounts, aggregateTotals, aggregateProjections, anyLoading, refreshAll } =
    useCopilotUsage()

  const totalPrsViewed =
    (stats?.prsViewed ?? 0) + (stats?.prsReviewed ?? 0) + (stats?.prsMergedWatched ?? 0)
  const activePrs = Object.values(prCounts).reduce((a, b) => a + b, 0)
  const reposBrowsed = stats?.reposBrowsed ?? 0
  const copilotPrReviews =
    ((stats as Record<string, unknown> | undefined)?.copilotPrReviews as number) ?? 0
  const runsTriggered = stats?.runsTriggered ?? 0
  const runsCompleted = stats?.runsCompleted ?? 0
  const runsFailed = stats?.runsFailed ?? 0
  const repoBookmarks = useRepoBookmarks()
  const bookmarks = repoBookmarks?.length ?? 0
  const firstLaunch = stats?.firstLaunchDate ?? 0
  const appLaunches = stats?.appLaunches ?? 0
  const storedUptime = stats?.totalUptimeMs ?? 0
  const lastSessionStart = (stats as Record<string, unknown> | undefined)?.lastSessionStart as
    | number
    | undefined

  const [clientSessionStart] = useState<number>(() => Date.now())
  const [liveUptime, setLiveUptime] = useState(storedUptime)

  useEffect(() => {
    const compute = () => {
      const sessionStart = lastSessionStart ?? clientSessionStart
      const sessionElapsed = Math.max(0, Date.now() - sessionStart)
      setLiveUptime(prev => {
        const newVal = storedUptime + sessionElapsed
        return newVal !== prev ? newVal : prev
      })
    }

    compute()
    const timer = setInterval(compute, 1_000)
    return () => clearInterval(timer)
  }, [storedUptime, lastSessionStart, clientSessionStart])

  const totalFinished = runsCompleted + runsFailed
  const successRate = totalFinished > 0 ? Math.round((runsCompleted / totalFinished) * 100) : 0
  const hasCopilotAccounts = accounts.length > 0

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

  const handleCopilotUsageAction = () => {
    if (hasCopilotAccounts) {
      onSectionChange('copilot')
      onNavigate('copilot-usage')
      return
    }

    onSectionChange('settings')
    onNavigate('settings-accounts')
  }

  return (
    <div className="welcome-panel">
      <div className="welcome-stack">
        <div className="welcome-card">
          <div className="welcome-header">
            <div className="welcome-header-row">
              <div className="welcome-icon">
                <Users size={32} strokeWidth={2.5} />
              </div>
              <div className="welcome-header-text">
                <h1 className="welcome-app-name">Buddy</h1>
                <div className="welcome-tagline">
                  <span className="welcome-tagline-emoji">🤝</span>
                  <span>Your Universal Productivity Companion</span>
                </div>
              </div>
              <div className="welcome-header-meta">
                <div className="welcome-version-badge">v0.1.3</div>
                {liveUptime > 0 && (
                  <div className="welcome-uptime-badge">
                    <Clock size={12} />
                    <span>{formatUptime(liveUptime)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <section className="welcome-usage-strip" aria-label="Copilot usage overview">
            <div className="welcome-usage-strip-header">
              <div className="welcome-usage-strip-title">
                <div className="welcome-stat-icon welcome-stat-icon-copilot">
                  <Sparkles size={18} />
                </div>
                <div className="welcome-usage-strip-copy">
                  <span className="welcome-usage-strip-name">Copilot Usage</span>
                  <span className="welcome-usage-strip-description">
                    {hasCopilotAccounts
                      ? `${accounts.length} connected account${accounts.length === 1 ? '' : 's'}`
                      : 'No accounts configured'}
                  </span>
                </div>
              </div>

              <div className="welcome-usage-actions">
                <button
                  className="welcome-usage-btn"
                  onClick={refreshAll}
                  disabled={anyLoading || !hasCopilotAccounts}
                  title="Refresh Copilot usage data"
                >
                  <RefreshCw size={14} className={anyLoading ? 'spin' : ''} />
                  <span>Refresh</span>
                </button>
                <button className="welcome-usage-btn" onClick={handleCopilotUsageAction}>
                  <span>{hasCopilotAccounts ? 'Open Usage' : 'Configure Accounts'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>

            <div className="welcome-usage-stats" aria-live="polite">
              <div className="welcome-stat-card welcome-usage-stat-card">
                <div className="welcome-stat-icon welcome-stat-icon-copilot-soft">
                  <Zap size={18} />
                </div>
                <div className="welcome-stat-info">
                  <span className="welcome-stat-value">
                    {aggregateTotals.totalUsed.toLocaleString()}
                  </span>
                  <span className="welcome-stat-label">Total Used</span>
                </div>
              </div>

              <div className="welcome-stat-card welcome-usage-stat-card">
                <div className="welcome-stat-icon welcome-stat-icon-copilot-soft">
                  <Sparkles size={18} />
                </div>
                <div className="welcome-stat-info">
                  <span className="welcome-stat-value">
                    {formatCurrency(aggregateTotals.totalOverageCost)}
                  </span>
                  <span className="welcome-stat-label">Total Overage</span>
                </div>
              </div>

              <div className="welcome-stat-card welcome-usage-stat-card">
                <div className="welcome-stat-icon welcome-stat-icon-copilot-soft">
                  <Activity size={18} />
                </div>
                <div className="welcome-stat-info">
                  <span className="welcome-stat-value">
                    {aggregateProjections?.projectedTotal?.toLocaleString() ?? '...'}
                  </span>
                  <span className="welcome-stat-label">Projected</span>
                </div>
              </div>

              <div className="welcome-stat-card welcome-usage-stat-card welcome-usage-stat-card-accent">
                <div className="welcome-stat-icon welcome-stat-icon-overage">
                  <ArrowRight size={18} />
                </div>
                <div className="welcome-stat-info">
                  <span className="welcome-stat-value">
                    {aggregateProjections?.projectedOverageCost != null &&
                    aggregateProjections.projectedOverageCost > 0
                      ? formatCurrency(aggregateProjections.projectedOverageCost)
                      : '$0.00'}
                  </span>
                  <span className="welcome-stat-label">Est. Overage</span>
                </div>
              </div>
            </div>
          </section>

          <div className="welcome-stats-grid">
            <div className="welcome-stat-card">
              <div className="welcome-stat-icon">
                <GitPullRequest size={18} />
              </div>
              <div className="welcome-stat-info">
                <span className="welcome-stat-value">{formatNumber(totalPrsViewed)}</span>
                <span className="welcome-stat-label">PRs Viewed</span>
              </div>
            </div>

            <div className="welcome-stat-card">
              <div className="welcome-stat-icon welcome-stat-icon-live">
                <Activity size={18} />
              </div>
              <div className="welcome-stat-info">
                <span className="welcome-stat-value">{formatNumber(activePrs)}</span>
                <span className="welcome-stat-label">Active PRs</span>
              </div>
            </div>

            <div className="welcome-stat-card">
              <div className="welcome-stat-icon">
                <Sparkles size={18} />
              </div>
              <div className="welcome-stat-info">
                <span className="welcome-stat-value">{formatNumber(copilotPrReviews)}</span>
                <span className="welcome-stat-label">PRs Reviewed</span>
              </div>
            </div>

            <div className="welcome-stat-card">
              <div className="welcome-stat-icon">
                <FolderGit2 size={18} />
              </div>
              <div className="welcome-stat-info">
                <span className="welcome-stat-value">{formatNumber(reposBrowsed)}</span>
                <span className="welcome-stat-label">Repos Browsed</span>
              </div>
            </div>

            <div className="welcome-stat-card">
              <div className="welcome-stat-icon">
                <Play size={18} />
              </div>
              <div className="welcome-stat-info">
                <span className="welcome-stat-value">{formatNumber(runsTriggered)}</span>
                <span className="welcome-stat-label">Runs Executed</span>
                {totalFinished > 0 && <span className="welcome-stat-subtitle">{successRate}%</span>}
              </div>
            </div>

            <div className="welcome-stat-card">
              <div className="welcome-stat-icon">
                <Star size={18} />
              </div>
              <div className="welcome-stat-info">
                <span className="welcome-stat-value">{formatNumber(bookmarks)}</span>
                <span className="welcome-stat-label">Bookmarks</span>
              </div>
            </div>

            <div className="welcome-stat-card">
              <div className="welcome-stat-icon">
                <Calendar size={18} />
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

          <div className="welcome-quick-actions">
            <button className="welcome-action-btn" onClick={() => handleQuickAction('my-prs')}>
              <GitPullRequest size={16} />
              <span>My PRs</span>
            </button>
            <button
              className="welcome-action-btn"
              onClick={() => handleQuickAction('organizations')}
            >
              <Building2 size={16} />
              <span>Organizations</span>
            </button>
            <button className="welcome-action-btn" onClick={() => handleQuickAction('jobs')}>
              <Zap size={16} />
              <span>Jobs</span>
            </button>
            <button className="welcome-action-btn" onClick={() => handleQuickAction('settings')}>
              <Settings size={16} />
              <span>Settings</span>
            </button>
          </div>

          <div className="welcome-footer">
            <span>Made with</span>
            <Heart size={12} className="welcome-heart" />
            <span>by HemSoft Developments</span>
          </div>
        </div>
      </div>
    </div>
  )
}
