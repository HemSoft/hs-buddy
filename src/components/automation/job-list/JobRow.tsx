import { Terminal, Brain, Zap, Play, Copy, Trash2 } from 'lucide-react'
import type { Job } from './types'

export function getWorkerIcon(workerType: 'exec' | 'ai' | 'skill', size = 16) {
  switch (workerType) {
    case 'exec':
      return <Terminal size={size} className="worker-icon worker-exec" />
    case 'ai':
      return <Brain size={size} className="worker-icon worker-ai" />
    case 'skill':
      return <Zap size={size} className="worker-icon worker-skill" />
  }
}

export function getConfigPreview(job: Job): string {
  switch (job.workerType) {
    case 'exec':
      return job.config.command || 'No command'
    case 'ai':
      if (job.config.prompt) {
        return job.config.prompt.length > 50
          ? job.config.prompt.substring(0, 50) + '...'
          : job.config.prompt
      }
      return 'No prompt'
    case 'skill':
      if (job.config.skillName) {
        return job.config.action
          ? `${job.config.skillName}:${job.config.action}`
          : job.config.skillName
      }
      return 'No skill'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function JobRow({ job, runCounts, onEdit, onDuplicate, onDelete, onRunNow, onContextMenu }: any) {
  return (
    <div
      className="job-row"
      onContextMenu={(e) => onContextMenu(e, job)}
      onClick={() => onEdit(job._id)}
      title={job.description || job.name}
    >
      {getWorkerIcon(job.workerType)}
      <span className="job-row-name">{job.name}</span>
      <span className="job-row-preview">{getConfigPreview(job)}</span>
      {runCounts && runCounts.total > 0 && (
        <span className="job-row-run-count" title={`${runCounts.total} runs (${runCounts.completed} completed${runCounts.failed > 0 ? `, ${runCounts.failed} failed` : ''})`}>
          <Play size={10} />
          {runCounts.total}
        </span>
      )}
      <div className="job-row-actions">
        <button
          className="btn-icon-sm"
          onClick={(e) => { e.stopPropagation(); onRunNow(job) }}
          title="Run Now"
        >
          <Play size={14} />
        </button>
        <button
          className="btn-icon-sm"
          onClick={(e) => { e.stopPropagation(); onDuplicate(job) }}
          title="Duplicate"
        >
          <Copy size={14} />
        </button>
        <button
          className="btn-icon-sm btn-danger"
          onClick={(e) => { e.stopPropagation(); onDelete(job._id, job.name) }}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
