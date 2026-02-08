import { useState } from 'react'
import {
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  ExternalLink,
  Filter,
} from 'lucide-react'
import { useCopilotResultsRecent, useCopilotResultMutations } from '../hooks/useConvex'
import './CopilotResultsList.css'

interface CopilotResultsListProps {
  onOpenResult: (resultId: string) => void
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'running', label: 'Running' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
]

export function CopilotResultsList({ onOpenResult }: CopilotResultsListProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const results = useCopilotResultsRecent(50)
  const { remove } = useCopilotResultMutations()

  const filteredResults = results
    ? statusFilter === 'all'
      ? results
      : results.filter(r => r.status === statusFilter)
    : []

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock size={14} className="result-status-pending" />
      case 'running':
        return <Loader2 size={14} className="spin result-status-running" />
      case 'completed':
        return <CheckCircle2 size={14} className="result-status-completed" />
      case 'failed':
        return <XCircle size={14} className="result-status-failed" />
      default:
        return null
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
  }

  const handleDelete = async (e: React.MouseEvent, resultId: string) => {
    e.stopPropagation()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await remove({ id: resultId as any })
  }

  if (results === undefined) {
    return (
      <div className="copilot-results-list">
        <div className="copilot-results-loading">
          <Loader2 size={32} className="spin" />
          <p>Loading results...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="copilot-results-list">
      {/* Header */}
      <div className="copilot-results-header">
        <div className="copilot-results-title">
          <Sparkles size={20} />
          <h2>Copilot Results</h2>
          <span className="copilot-results-count">{results.length}</span>
        </div>
        <div className="copilot-results-filters">
          <Filter size={14} />
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`copilot-filter-btn ${statusFilter === f.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results table */}
      <div className="copilot-results-table-wrapper">
        {filteredResults.length === 0 ? (
          <div className="copilot-results-empty">
            <Sparkles size={48} />
            <p>No results {statusFilter !== 'all' ? `with status "${statusFilter}"` : 'yet'}</p>
            <p className="copilot-results-empty-subtitle">
              Use the prompt box or right-click a PR to request an AI review.
            </p>
          </div>
        ) : (
          <table className="copilot-results-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Prompt</th>
                <th>Category</th>
                <th>Model</th>
                <th>Duration</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map(r => {
                const metadata = r.metadata as Record<string, unknown> | null
                return (
                  <tr
                    key={r._id}
                    className="copilot-result-row"
                    onClick={() => onOpenResult(r._id)}
                  >
                    <td className="result-status-cell">
                      {statusIcon(r.status)}
                    </td>
                    <td className="result-prompt-cell">
                      <span className="result-prompt-text">
                        {r.category === 'pr-review' && metadata?.prTitle
                          ? `PR Review: ${metadata.prTitle as string}`
                          : r.prompt.length > 80
                            ? r.prompt.slice(0, 80) + '...'
                            : r.prompt}
                      </span>
                    </td>
                    <td className="result-category-cell">
                      {r.category && (
                        <span className="result-category-badge">{r.category}</span>
                      )}
                    </td>
                    <td className="result-model-cell">
                      {r.model && <span className="result-model-badge">{r.model}</span>}
                    </td>
                    <td className="result-duration-cell">
                      {r.duration ? formatDuration(r.duration) : '—'}
                    </td>
                    <td className="result-date-cell">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="result-actions-cell">
                      {r.category === 'pr-review' && !!metadata?.prUrl && (
                        <button
                          className="result-action-btn"
                          onClick={e => {
                            e.stopPropagation()
                            window.shell.openExternal(metadata.prUrl as string)
                          }}
                          title="Open PR"
                        >
                          <ExternalLink size={12} />
                        </button>
                      )}
                      <button
                        className="result-action-btn danger"
                        onClick={e => handleDelete(e, r._id)}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
