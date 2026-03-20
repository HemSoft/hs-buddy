import { Code2, Users, Building2 } from 'lucide-react'
import type { RepoDetail } from '../../api/github'
import { formatDistanceToNow } from '../../utils/dateUtils'
import { getLanguageColor, formatDate, formatSize } from './repoDetailUtils'

interface RepoContentGridProps {
  detail: RepoDetail
}

interface LanguageEntry {
  lang: string
  bytes: number
  percentage: number
}

export function RepoContentGrid({ detail }: RepoContentGridProps) {
  const totalBytes = Object.values(detail.languages).reduce((a, b) => a + b, 0)
  const languageEntries: LanguageEntry[] = Object.entries(detail.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, bytes]) => ({
      lang,
      bytes,
      percentage: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0,
    }))

  return (
    <div className="repo-detail-grid">
      {/* Languages Card */}
      {languageEntries.length > 0 && (
        <div className="repo-detail-card">
          <div className="repo-detail-card-header">
            <Code2 size={16} />
            <h3>Languages</h3>
          </div>
          <div className="repo-lang-bar">
            {languageEntries.map(({ lang, percentage }) => (
              <div
                key={lang}
                className="repo-lang-segment"
                style={{
                  width: `${Math.max(percentage, 0.5)}%`,
                  backgroundColor: getLanguageColor(lang),
                }}
                title={`${lang}: ${percentage.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="repo-lang-list">
            {languageEntries.slice(0, 8).map(({ lang, percentage }) => (
              <div key={lang} className="repo-lang-item">
                <span className="lang-dot" style={{ backgroundColor: getLanguageColor(lang) }} />
                <span className="repo-lang-name">{lang}</span>
                <span className="repo-lang-pct">{percentage.toFixed(1)}%</span>
              </div>
            ))}
            {languageEntries.length > 8 && (
              <div className="repo-lang-item repo-lang-more">
                +{languageEntries.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contributors Card */}
      {detail.topContributors.length > 0 && (
        <div className="repo-detail-card">
          <div className="repo-detail-card-header">
            <Users size={16} />
            <h3>Top Contributors</h3>
          </div>
          <div className="repo-contributors-list">
            {detail.topContributors.map(contributor => (
              <button
                key={contributor.login}
                type="button"
                className="repo-contributor-item"
                onClick={() => window.shell?.openExternal(contributor.url)}
                title={`${contributor.login}: ${contributor.contributions} commits`}
              >
                <img
                  src={contributor.avatarUrl}
                  alt={contributor.login}
                  className="repo-contributor-avatar"
                />
                <div className="repo-contributor-info">
                  <span className="repo-contributor-name">{contributor.name ?? contributor.login}</span>
                  <span className="repo-contributor-count">
                    {contributor.contributions.toLocaleString()} commits
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Repo Info Card */}
      <div className="repo-detail-card">
        <div className="repo-detail-card-header">
          <Building2 size={16} />
          <h3>Repository Info</h3>
        </div>
        <div className="repo-info-list">
          <div className="repo-info-item">
            <span className="repo-info-label">Created</span>
            <span className="repo-info-value">{formatDate(detail.createdAt)}</span>
          </div>
          <div className="repo-info-item">
            <span className="repo-info-label">Updated</span>
            <span className="repo-info-value">
              {formatDate(detail.updatedAt)}
              <span className="repo-info-relative">{formatDistanceToNow(detail.updatedAt)}</span>
            </span>
          </div>
          {detail.pushedAt && (
            <div className="repo-info-item">
              <span className="repo-info-label">Last Push</span>
              <span className="repo-info-value">
                {formatDate(detail.pushedAt)}
                <span className="repo-info-relative">{formatDistanceToNow(detail.pushedAt)}</span>
              </span>
            </div>
          )}
          <div className="repo-info-item">
            <span className="repo-info-label">Size</span>
            <span className="repo-info-value">{formatSize(detail.sizeKB)}</span>
          </div>
          <div className="repo-info-item">
            <span className="repo-info-label">Default Branch</span>
            <span className="repo-info-value">{detail.defaultBranch}</span>
          </div>
          {detail.license && (
            <div className="repo-info-item">
              <span className="repo-info-label">License</span>
              <span className="repo-info-value">{detail.license}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
