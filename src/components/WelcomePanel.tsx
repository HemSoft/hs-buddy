import { useState, useEffect } from 'react'
import { Users, GitPullRequest, Clock, Building2, Zap, Settings, Heart } from 'lucide-react'
import { useBuddyStats, useRepoBookmarks } from '../hooks/useConvex'
import { useCopilotUsage } from '../hooks/useCopilotUsage'
import { useDashboardCards } from '../hooks/useDashboardCards'
import { formatUptime } from '../utils/dateUtils'
import { CommandCenterCard } from './dashboard/CommandCenterCard'
import { WorkspacePulseCard } from './dashboard/WorkspacePulseCard'
import { WeatherCard } from './dashboard/WeatherCard'
import { FinanceCard } from './dashboard/FinanceCard'
import { DashboardConfigDropdown } from './dashboard/DashboardConfigDropdown'
import './WelcomePanel.css'

interface WelcomePanelProps {
  prCounts: Record<string, number>
  onNavigate: (viewId: string) => void
  onSectionChange: (sectionId: string) => void
}

type QuickAction = 'my-prs' | 'organizations' | 'jobs' | 'settings'

function WelcomeHeader({
  liveUptime,
  cards,
  isVisible,
  toggleCard,
}: {
  liveUptime: number
  cards: ReturnType<typeof useDashboardCards>['cards']
  isVisible: ReturnType<typeof useDashboardCards>['isVisible']
  toggleCard: ReturnType<typeof useDashboardCards>['toggleCard']
}) {
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
          <div className="welcome-header-meta-top">
            <div className="welcome-version-badge">Version 0.1.739</div>
            <DashboardConfigDropdown cards={cards} isVisible={isVisible} toggleCard={toggleCard} />
          </div>
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

interface DashboardCardContentProps {
  cardId: string
  commandCenter: {
    accountCount: number
    hasCopilotAccounts: boolean
    anyLoading: boolean
    onRefresh: () => void
    onOpenUsage: () => void
    totalUsed: number
    totalOverage: number
    projectedTotal: number | null | undefined
    projectedOverageCost: number | null | undefined
  }
  workspacePulse: {
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
  }
}

function DashboardCardContent({
  cardId,
  commandCenter,
  workspacePulse,
}: DashboardCardContentProps) {
  switch (cardId) {
    case 'command-center':
      return <CommandCenterCard {...commandCenter} />
    case 'workspace-pulse':
      return <WorkspacePulseCard {...workspacePulse} />
    case 'weather':
      return <WeatherCard />
    case 'finance':
      return <FinanceCard />
    default:
      return null
  }
}

const PR_STAT_DEFAULTS = { prsViewed: 0, prsReviewed: 0, prsMergedWatched: 0, reposBrowsed: 0 }

function extractPrStats(stats: ReturnType<typeof useBuddyStats>) {
  const { prsViewed, prsReviewed, prsMergedWatched, reposBrowsed } = {
    ...PR_STAT_DEFAULTS,
    ...(stats ?? {}),
  }
  return { prsViewed, prsReviewed, prsMergedWatched, reposBrowsed }
}

const RUN_STAT_DEFAULTS = { runsTriggered: 0, runsCompleted: 0, runsFailed: 0 }

function extractRunAndSessionStats(
  stats: ReturnType<typeof useBuddyStats>,
  repoBookmarks: ReturnType<typeof useRepoBookmarks>
) {
  const { runsTriggered, runsCompleted, runsFailed } = { ...RUN_STAT_DEFAULTS, ...(stats ?? {}) }
  const bookmarks = repoBookmarks?.length ?? 0
  const totalFinished = runsCompleted + runsFailed
  const successRate = totalFinished > 0 ? Math.round((runsCompleted / totalFinished) * 100) : 0
  return { runsTriggered, runsCompleted, runsFailed, totalFinished, successRate, bookmarks }
}

const APP_STAT_DEFAULTS = {
  copilotPrReviews: 0,
  firstLaunchDate: 0,
  appLaunches: 0,
  totalUptimeMs: 0,
  lastSessionStart: undefined as number | undefined,
}

function extractAppStats(stats: ReturnType<typeof useBuddyStats>) {
  const { copilotPrReviews, firstLaunchDate, appLaunches, totalUptimeMs, lastSessionStart } = {
    ...APP_STAT_DEFAULTS,
    ...(stats ?? {}),
  }
  return {
    copilotPrReviews,
    firstLaunch: firstLaunchDate,
    appLaunches,
    storedUptime: totalUptimeMs,
    lastSessionStart,
  }
}

function useWelcomeStats(prCounts: Record<string, number>) {
  const stats = useBuddyStats()
  const repoBookmarks = useRepoBookmarks()

  const prStats = extractPrStats(stats)
  const runStats = extractRunAndSessionStats(stats, repoBookmarks)
  const appStats = extractAppStats(stats)

  const totalPrsViewed = prStats.prsViewed + prStats.prsReviewed + prStats.prsMergedWatched
  const activePrs = Object.values(prCounts).reduce((a, b) => a + b, 0)

  return {
    totalPrsViewed,
    activePrs,
    reposBrowsed: prStats.reposBrowsed,
    copilotPrReviews: appStats.copilotPrReviews,
    runsTriggered: runStats.runsTriggered,
    totalFinished: runStats.totalFinished,
    successRate: runStats.successRate,
    bookmarks: runStats.bookmarks,
    firstLaunch: appStats.firstLaunch,
    appLaunches: appStats.appLaunches,
    storedUptime: appStats.storedUptime,
    lastSessionStart: appStats.lastSessionStart,
  }
}

function useLiveUptime(storedUptime: number, lastSessionStart: number | undefined) {
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

  return liveUptime
}

export function WelcomePanel({ prCounts, onNavigate, onSectionChange }: WelcomePanelProps) {
  const { accounts, aggregateTotals, aggregateProjections, anyLoading, refreshAll } =
    useCopilotUsage()
  const { cards, visibleCards, isVisible, toggleCard } = useDashboardCards()

  const welcomeStats = useWelcomeStats(prCounts)
  const liveUptime = useLiveUptime(welcomeStats.storedUptime, welcomeStats.lastSessionStart)
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

  const commandCenterProps = {
    accountCount: accounts.length,
    hasCopilotAccounts,
    anyLoading,
    onRefresh: refreshAll,
    onOpenUsage: handleCopilotUsageAction,
    totalUsed: aggregateTotals.totalUsed,
    totalOverage: aggregateTotals.totalOverageCost,
    projectedTotal: aggregateProjections?.projectedTotal,
    projectedOverageCost: aggregateProjections?.projectedOverageCost,
  }

  const workspacePulseProps = {
    totalPrsViewed: welcomeStats.totalPrsViewed,
    activePrs: welcomeStats.activePrs,
    copilotPrReviews: welcomeStats.copilotPrReviews,
    reposBrowsed: welcomeStats.reposBrowsed,
    runsTriggered: welcomeStats.runsTriggered,
    totalFinished: welcomeStats.totalFinished,
    successRate: welcomeStats.successRate,
    bookmarks: welcomeStats.bookmarks,
    firstLaunch: welcomeStats.firstLaunch,
    appLaunches: welcomeStats.appLaunches,
  }

  return (
    <div className="welcome-panel">
      <div className="welcome-stack">
        <WelcomeHeader
          liveUptime={liveUptime}
          cards={cards}
          isVisible={isVisible}
          toggleCard={toggleCard}
        />
        <div className="dashboard-grid">
          {visibleCards.map(card => (
            <div
              key={card.id}
              className={`dashboard-grid-item${card.span === 2 ? ' dashboard-grid-span-2' : ''}`}
            >
              <DashboardCardContent
                cardId={card.id}
                commandCenter={commandCenterProps}
                workspacePulse={workspacePulseProps}
              />
            </div>
          ))}
        </div>
        <QuickActionsBar onQuickAction={handleQuickAction} />
        <WelcomeFooter />
      </div>
    </div>
  )
}
