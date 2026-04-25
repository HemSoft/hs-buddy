import { useState } from 'react'
import { Sparkles, Loader2, Trash2, ExternalLink, Filter } from 'lucide-react'
import { useCopilotResultsRecent, useCopilotResultMutations } from '../hooks/useConvex'
import { formatDateCompact, formatDuration } from '../utils/dateUtils'
import { getStatusIcon } from './shared/statusDisplay'
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

const PROMPT_PREVIEW_MAX_LENGTH = 80

function PromptResultLabel({
  result,
}: {
  result: NonNullable<ReturnType<typeof useCopilotResultsRecent>>[number]
}) {
  const metadata = result.metadata as Record<string, unknown> | null
  const label =
    result.category === 'pr-review' && metadata?.prTitle
      ? `PR Review: ${metadata.prTitle as string}`
      : result.prompt.length > PROMPT_PREVIEW_MAX_LENGTH
        ? result.prompt.slice(0, PROMPT_PREVIEW_MAX_LENGTH) + '…'
        : result.prompt
  return <span className="result-prompt-text">{label}</span>
}

function CopilotResultRow({
  r,
  onOpenResult,
  onDelete,
}: {
  r: NonNullable<ReturnType<typeof useCopilotResultsRecent>>[number]
  onOpenResult: (resultId: string) => void
  onDelete: (e: React.MouseEvent, resultId: string) => void
}) {
  const metadata = r.metadata as Record<string, unknown> | null
  return (
    <tr className="copilot-result-row" onClick={() => onOpenResult(r._id)}>
      <td className="result-status-cell">{getStatusIcon(r.status, 14, 'result-status')}</td>
      <td className="result-prompt-cell">
        <PromptResultLabel result={r} />
      </td>
      <td className="result-category-cell">
        {r.category && <span className="result-category-badge">{r.category}</span>}
      </td>
      <td className="result-model-cell">
        {r.model && <span className="result-model-badge">{r.model}</span>}
      </td>
      <td className="result-duration-cell">{r.duration ? formatDuration(r.duration) : '—'}</td>
      <td className="result-date-cell">{formatDateCompact(r.createdAt)}</td>
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
          onClick={e => onDelete(e, r._id)}
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  )
}

export function CopilotResultsList({ onOpenResult }: CopilotResultsListProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const results = useCopilotResultsRecent(50)
  const { remove } = useCopilotResultMutations()

  const filteredResults = results
    ? statusFilter === 'all'
      ? results
      : results.filter(r => r.status === statusFilter)
    : []

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
              {filteredResults.map(r => (
                <CopilotResultRow
                  key={r._id}
                  r={r}
                  onOpenResult={onOpenResult}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
