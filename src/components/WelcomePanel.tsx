import { useState, useEffect, type ReactNode } from 'react'
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
import { formatUptime } from '../utils/dateUtils'
import { formatCurrency } from './copilot-usage/quotaUtils'
import './WelcomePanel.css'

interface WelcomePanelProps {
  prCounts: Record<string, number>
  onNavigate: (viewId: string) => void
  onSectionChange: (sectionId: string) => void
}

type QuickAction = 'my-prs' | 'organizations' | 'jobs' | 'settings'

interface WelcomeStatCardProps {
  icon: ReactNode
  value: string
  label: string
  subtitle?: string
  cardClassName?: string
  iconClassName?: string
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function WelcomeHeader({ liveUptime }: { liveUptime: number }) {
  return (
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
          <div className="welcome-version-badge">Version 0.1.689</div>
          {liveUptime > 0 && (
            <div className="welcome-uptime-badge">
              <Clock size={12} />
              <span>{formatUptime(liveUptime)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WelcomeSectionHeading({
  kicker,
  title,
  caption,
}: {
  kicker: string
  title: string
  caption: string
}) {
  return (
    <div className="welcome-section-heading">
      <div className="welcome-section-heading-copy">
        <span className="welcome-section-kicker">{kicker}</span>
        <h2 className="welcome-section-title">{title}</h2>
      </div>
      <span className="welcome-section-caption">{caption}</span>
    </div>
  )
}

function WelcomeStatCard({
  icon,
  value,
  label,
  subtitle,
  cardClassName,
  iconClassName,
}: WelcomeStatCardProps) {
  const cardClasses = ['welcome-stat-card', cardClassName].filter(Boolean).join(' ')
  const iconClasses = ['welcome-stat-icon', iconClassName].filter(Boolean).join(' ')

  return (
    <div className={cardClasses}>
      <div className={iconClasses}>{icon}</div>
      <div className="welcome-stat-info">
        <span className="welcome-stat-value">{value}</span>
        <span className="welcome-stat-label">{label}</span>
        {subtitle && <span className="welcome-stat-subtitle">{subtitle}</span>}
      </div>
    </div>
  )
}

function CopilotUsageSection({
  accountCount,
  hasCopilotAccounts,
  anyLoading,
  onRefresh,
  onOpenUsage,
  totalUsed,
  totalOverage,
  projectedTotal,
  projectedOverageCost,
}: {
  accountCount: number
  hasCopilotAccounts: boolean
  anyLoading: boolean
  onRefresh: () => void
  onOpenUsage: () => void
  totalUsed: number
  totalOverage: number
  projectedTotal: number | null | undefined
  projectedOverageCost: number | null | undefined
}) {
  return (
    <section
      className="welcome-section welcome-section-copilot"
      aria-label="Copilot usage overview"
    >
      <WelcomeSectionHeading
        kicker="Copilot usage"
        title="Command Center"
        caption="Live spend, projection, and account health at a glance"
      />

      <div className="welcome-usage-strip-header">
        <div className="welcome-usage-strip-title">
          <div className="welcome-stat-icon welcome-stat-icon-copilot">
            <Sparkles size={18} />
          </div>
          <div className="welcome-usage-strip-copy">
            <span className="welcome-usage-strip-name">Connected Accounts</span>
            <span className="welcome-usage-strip-description">
              {hasCopilotAccounts
                ? `${accountCount} connected account${accountCount === 1 ? '' : 's'}`
                : 'No accounts configured'}
            </span>
          </div>
        </div>

        <div className="welcome-usage-actions">
          <button
            type="button"
            className="welcome-usage-btn"
            onClick={onRefresh}
            disabled={anyLoading || !hasCopilotAccounts}
            title="Refresh Copilot usage data"
          >
            <RefreshCw size={14} className={anyLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button type="button" className="welcome-usage-btn" onClick={onOpenUsage}>
            <span>{hasCopilotAccounts ? 'Open Usage' : 'Configure Accounts'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="welcome-usage-stats" aria-live="polite">
        <WelcomeStatCard
          icon={<Zap size={18} />}
          value={totalUsed.toLocaleString()}
          label="Total Used"
          cardClassName="welcome-usage-stat-card"
          iconClassName="welcome-stat-icon-copilot-soft"
        />
        <WelcomeStatCard
          icon={<Sparkles size={18} />}
          value={formatCurrency(totalOverage)}
          label="Total Overage"
          cardClassName="welcome-usage-stat-card"
          iconClassName="welcome-stat-icon-copilot-soft"
        />
        <WelcomeStatCard
          icon={<Activity size={18} />}
          value={projectedTotal?.toLocaleString() ?? '...'}
          label="Projected"
          cardClassName="welcome-usage-stat-card"
          iconClassName="welcome-stat-icon-copilot-soft"
        />
        <WelcomeStatCard
          icon={<ArrowRight size={18} />}
          value={
            projectedOverageCost != null && projectedOverageCost > 0
              ? formatCurrency(projectedOverageCost)
              : '$0.00'
          }
          label="Est. Overage"
          cardClassName="welcome-usage-stat-card welcome-usage-stat-card-accent"
          iconClassName="welcome-stat-icon-overage"
        />
      </div>
    </section>
  )
}

function ActivityOverviewSection({
  totalPrsViewed,
  activePrs,
  copilotPrReviews,
  reposBrowsed,
  runsTriggered,
  totalFinished,
  successRate,
  bookmarks,
  firstLaunch,
  appLaunches,
}: {
  totalPrsViewed: number
  activePrs: number
  copilotPrReviews: number
  reposBrowsed: number
  runsTriggered: number
  totalFinished: number
  successRate: number
  bookmarks: number
  firstLaunch: number
  appLaunches: number
}) {
  return (
    <section
      className="welcome-section welcome-section-activity"
      aria-label="Buddy activity overview"
    >
      <WelcomeSectionHeading
        kicker="Buddy activity"
        title="Workspace Pulse"
        caption="Pull requests, runs, bookmarks, and session history in one panel"
      />

      <div className="welcome-stats-grid">
        <WelcomeStatCard
          icon={<GitPullRequest size={18} />}
          value={formatNumber(totalPrsViewed)}
          label="PRs Viewed"
        />
        <WelcomeStatCard
          icon={<Activity size={18} />}
          value={formatNumber(activePrs)}
          label="Active PRs"
          iconClassName="welcome-stat-icon-live"
        />
        <WelcomeStatCard
          icon={<Sparkles size={18} />}
          value={formatNumber(copilotPrReviews)}
          label="PRs Reviewed"
        />
        <WelcomeStatCard
          icon={<FolderGit2 size={18} />}
          value={formatNumber(reposBrowsed)}
          label="Repos Browsed"
        />
        <WelcomeStatCard
          icon={<Play size={18} />}
          value={formatNumber(runsTriggered)}
          label="Runs Executed"
          subtitle={totalFinished > 0 ? `${successRate}%` : undefined}
        />
        <WelcomeStatCard
          icon={<Star size={18} />}
          value={formatNumber(bookmarks)}
          label="Bookmarks"
        />
        <WelcomeStatCard
          icon={<Calendar size={18} />}
          value={
            firstLaunch
              ? new Date(firstLaunch).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                })
              : 'Today'
          }
          label="Member Since"
          subtitle={
            appLaunches > 0
              ? `${formatNumber(appLaunches)} session${appLaunches !== 1 ? 's' : ''}`
              : undefined
          }
        />
      </div>
    </section>
  )
}

function QuickActionsBar({ onQuickAction }: { onQuickAction: (action: QuickAction) => void }) {
  return (
    <div className="welcome-quick-actions">
      <button type="button" className="welcome-action-btn" onClick={() => onQuickAction('my-prs')}>
        <GitPullRequest size={16} />
        <span>My PRs</span>
      </button>
      <button
        type="button"
        className="welcome-action-btn"
        onClick={() => onQuickAction('organizations')}
      >
        <Building2 size={16} />
        <span>Organizations</span>
      </button>
      <button type="button" className="welcome-action-btn" onClick={() => onQuickAction('jobs')}>
        <Zap size={16} />
        <span>Jobs</span>
      </button>
      <button
        type="button"
        className="welcome-action-btn"
        onClick={() => onQuickAction('settings')}
      >
        <Settings size={16} />
        <span>Settings</span>
      </button>
    </div>
  )
}

function WelcomeFooter() {
  return (
    <div className="welcome-footer">
      <span>Made with</span>
      <Heart size={12} className="welcome-heart" />
      <span>by HemSoft Developments</span>
    </div>
  )
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

  const handleQuickAction = (action: QuickAction) => {
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
          <WelcomeHeader liveUptime={liveUptime} />
          <CopilotUsageSection
            accountCount={accounts.length}
            hasCopilotAccounts={hasCopilotAccounts}
            anyLoading={anyLoading}
            onRefresh={refreshAll}
            onOpenUsage={handleCopilotUsageAction}
            totalUsed={aggregateTotals.totalUsed}
            totalOverage={aggregateTotals.totalOverageCost}
            projectedTotal={aggregateProjections?.projectedTotal}
            projectedOverageCost={aggregateProjections?.projectedOverageCost}
          />
          <ActivityOverviewSection
            totalPrsViewed={totalPrsViewed}
            activePrs={activePrs}
            copilotPrReviews={copilotPrReviews}
            reposBrowsed={reposBrowsed}
            runsTriggered={runsTriggered}
            totalFinished={totalFinished}
            successRate={successRate}
            bookmarks={bookmarks}
            firstLaunch={firstLaunch}
            appLaunches={appLaunches}
          />
          <QuickActionsBar onQuickAction={handleQuickAction} />
          <WelcomeFooter />
        </div>
      </div>
    </div>
  )
}
