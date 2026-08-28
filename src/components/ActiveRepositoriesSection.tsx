import {
  AlertCircle,
  CircleDot,
  ExternalLink,
  FolderKanban,
  GitPullRequest,
  RefreshCw,
} from 'lucide-react'
import type {
  ActiveRepositoryActivity,
  RepositoryActivityItem,
  RepositoryActivitySummary,
} from '../api/github'
import { formatDistanceToNow } from '../utils/dateUtils'
import type { LoadPhase } from './orgDetailReducer'
import './ActiveRepositoriesSection.css'

interface ActiveRepositoriesSectionProps {
  org: string
  activity: RepositoryActivitySummary | null
  phase: LoadPhase
}

function openExternal(url: string) {
  window.shell.openExternal(url)
}

function getAllActivityUrl(org: string): string {
  const query = encodeURIComponent(`user:${org} sort:updated-desc`)
  return `https://github.com/search?q=${query}&type=issues`
}

function ActivityState({ state }: { state: RepositoryActivityItem['state'] }) {
  return <span className={`active-repos-state active-repos-state-${state}`}>{state}</span>
}

function ActivityItem({ item }: { item: RepositoryActivityItem }) {
  return (
    <button
      type="button"
      className="active-repos-item"
      onClick={() => {
        openExternal(item.url)
      }}
      title={`Open #${item.number} on GitHub`}
    >
      <span className="active-repos-item-copy">
        <span className="active-repos-item-title">
          <span className="active-repos-item-number">#{item.number}</span>
          {item.title}
        </span>
        <span className="active-repos-item-meta">
          <ActivityState state={item.state} />
          <time dateTime={item.updatedAt}>{formatDistanceToNow(item.updatedAt)}</time>
        </span>
      </span>
      <ExternalLink aria-hidden="true" size={13} />
    </button>
  )
}

function ActivityLane({
  title,
  items,
  available,
  kind,
}: {
  title: string
  items: RepositoryActivityItem[]
  available: boolean
  kind: 'issues' | 'pull-requests'
}) {
  const Icon = kind === 'issues' ? CircleDot : GitPullRequest
  return (
    <div className={`active-repos-lane active-repos-lane-${kind}`}>
      <div className="active-repos-lane-heading">
        <span>
          <Icon aria-hidden="true" size={14} />
          {title}
        </span>
        <span className="active-repos-lane-count">{available ? items.length : '!'}</span>
      </div>
      {available ? (
        items.length === 0 ? (
          <div className="active-repos-lane-empty">Nothing recent</div>
        ) : (
          <div className="active-repos-items">
            {items.map(item => (
              <ActivityItem key={item.number} item={item} />
            ))}
          </div>
        )
      ) : (
        <div className="active-repos-lane-empty">Activity unavailable</div>
      )}
    </div>
  )
}

function RepositoryCard({
  repository,
  rank,
  activity,
}: {
  repository: ActiveRepositoryActivity
  rank: number
  activity: RepositoryActivitySummary
}) {
  return (
    <article className="active-repos-card">
      <div className="active-repos-card-header">
        <span className="active-repos-rank" aria-label={`Activity rank ${rank}`}>
          {rank.toString().padStart(2, '0')}
        </span>
        <button
          type="button"
          className="active-repos-repository-link"
          onClick={() => {
            openExternal(repository.url)
          }}
          title={`Open ${repository.fullName} on GitHub`}
        >
          <span>{repository.name}</span>
          <ExternalLink aria-hidden="true" size={13} />
        </button>
        <time className="active-repos-card-time" dateTime={repository.updatedAt}>
          {formatDistanceToNow(repository.updatedAt)}
        </time>
      </div>
      <div className="active-repos-lanes">
        <ActivityLane
          title="Issues"
          items={repository.issues}
          available={activity.issuesAvailable}
          kind="issues"
        />
        <ActivityLane
          title="Pull requests"
          items={repository.pullRequests}
          available={activity.pullRequestsAvailable}
          kind="pull-requests"
        />
      </div>
    </article>
  )
}

function ActivitySkeleton() {
  return (
    <div className="active-repos-skeleton" aria-label="Loading active repositories">
      {[0, 1].map(index => (
        <div className="active-repos-skeleton-card" key={index}>
          <div />
          <div />
        </div>
      ))}
    </div>
  )
}

function ActivityContent({
  activity,
  phase,
}: {
  activity: RepositoryActivitySummary | null
  phase: LoadPhase
}) {
  if (!activity) {
    if (phase === 'error') {
      return (
        <div className="active-repos-status active-repos-status-error">
          <AlertCircle aria-hidden="true" size={15} />
          Repository activity is unavailable. The rest of the overview is still current.
        </div>
      )
    }
    return <ActivitySkeleton />
  }

  const hasPartialError = !activity.issuesAvailable || !activity.pullRequestsAvailable
  return (
    <>
      {hasPartialError ? (
        <div className="active-repos-status active-repos-status-warning">
          <AlertCircle aria-hidden="true" size={15} />
          Showing the activity GitHub returned. One side could not be refreshed.
        </div>
      ) : null}
      {activity.repositories.length === 0 ? (
        <div className="active-repos-empty">
          <FolderKanban aria-hidden="true" size={22} />
          <span>No recent issue or pull-request activity found.</span>
        </div>
      ) : (
        <div className="active-repos-list">
          {activity.repositories.map((repository, index) => (
            <RepositoryCard
              key={repository.fullName}
              repository={repository}
              rank={index + 1}
              activity={activity}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function ActiveRepositoriesSection({
  org,
  activity,
  phase,
}: ActiveRepositoriesSectionProps) {
  const isRefreshing = phase === 'refreshing'

  return (
    <section className="org-detail-section active-repos-section">
      <div className="active-repos-section-header">
        <div>
          <div className="active-repos-kicker">Current workbench</div>
          <h3>
            <FolderKanban aria-hidden="true" size={16} />
            Active repositories
          </h3>
        </div>
        <div className="active-repos-header-meta">
          {isRefreshing ? (
            <span className="active-repos-refreshing">
              <RefreshCw aria-hidden="true" className="spin" size={12} />
              Refreshing
            </span>
          ) : activity ? (
            <span>Updated {formatDistanceToNow(activity.fetchedAt)}</span>
          ) : null}
          {activity?.hasMore ? (
            <button
              type="button"
              onClick={() => {
                openExternal(getAllActivityUrl(org))
              }}
            >
              All activity
              <ExternalLink aria-hidden="true" size={12} />
            </button>
          ) : null}
        </div>
      </div>
      <ActivityContent activity={activity} phase={phase} />
    </section>
  )
}
