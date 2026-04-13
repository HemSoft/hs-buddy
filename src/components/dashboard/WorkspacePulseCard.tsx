import { GitPullRequest, Activity, Sparkles, FolderGit2, Play, Star, Calendar } from 'lucide-react'
import { SectionHeading, StatCard, formatStatNumber } from './DashboardPrimitives'

interface WorkspacePulseCardProps {
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

export function WorkspacePulseCard({
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
}: WorkspacePulseCardProps) {
  return (
    <section
      className="welcome-section welcome-section-activity"
      aria-label="Buddy activity overview"
    >
      <SectionHeading
        kicker="Buddy activity"
        title="Workspace Pulse"
        caption="Pull requests, runs, bookmarks, and session history in one panel"
      />

      <div className="welcome-stats-grid">
        <StatCard
          icon={<GitPullRequest size={18} />}
          value={formatStatNumber(totalPrsViewed)}
          label="PRs Viewed"
        />
        <StatCard
          icon={<Activity size={18} />}
          value={formatStatNumber(activePrs)}
          label="Active PRs"
          iconClassName="welcome-stat-icon-live"
        />
        <StatCard
          icon={<Sparkles size={18} />}
          value={formatStatNumber(copilotPrReviews)}
          label="PRs Reviewed"
        />
        <StatCard
          icon={<FolderGit2 size={18} />}
          value={formatStatNumber(reposBrowsed)}
          label="Repos Browsed"
        />
        <StatCard
          icon={<Play size={18} />}
          value={formatStatNumber(runsTriggered)}
          label="Runs Executed"
          subtitle={totalFinished > 0 ? `${successRate}%` : undefined}
        />
        <StatCard icon={<Star size={18} />} value={formatStatNumber(bookmarks)} label="Bookmarks" />
        <StatCard
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
              ? `${formatStatNumber(appLaunches)} session${appLaunches !== 1 ? 's' : ''}`
              : undefined
          }
        />
      </div>
    </section>
  )
}
