import type { MouseEvent } from 'react'
import { Play, Copy, Trash2 } from 'lucide-react'
import type { Job } from './types'
import { getConfigPreview, getWorkerIcon } from './jobRowUtils'

interface JobRunCounts {
  total: number
  completed: number
  failed: number
}

interface JobRowProps {
  job: Job
  runCounts?: JobRunCounts
  onEdit: (jobId: Job['_id']) => void
  onDuplicate: (job: Job) => void
  onDelete: (jobId: Job['_id'], jobName: string) => void | Promise<void>
  onRunNow: (job: Job) => void | Promise<void>
  onContextMenu: (event: MouseEvent<HTMLDivElement>, job: Job) => void
}

export function JobRow({
  job,
  runCounts,
  onEdit,
  onDuplicate,
  onDelete,
  onRunNow,
  onContextMenu,
}: JobRowProps) {
  return (
    <div
      className="job-row"
      onContextMenu={e => onContextMenu(e, job)}
      onClick={() => onEdit(job._id)}
      title={job.description || job.name}
    >
      {getWorkerIcon(job.workerType)}
      <span className="job-row-name">{job.name}</span>
      <span className="job-row-preview">{getConfigPreview(job)}</span>
      {runCounts && runCounts.total > 0 && (
        <span
          className="job-row-run-count"
          title={`${runCounts.total} runs (${runCounts.completed} completed${runCounts.failed > 0 ? `, ${runCounts.failed} failed` : ''})`}
        >
          <Play size={10} />
          {runCounts.total}
        </span>
      )}
      <div className="job-row-actions">
        <button
          className="btn-icon-sm"
          onClick={e => {
            e.stopPropagation()
            onRunNow(job)
          }}
          title="Run Now"
        >
          <Play size={14} />
        </button>
        <button
          className="btn-icon-sm"
          onClick={e => {
            e.stopPropagation()
            onDuplicate(job)
          }}
          title="Duplicate"
        >
          <Copy size={14} />
        </button>
        <button
          className="btn-icon-sm btn-danger"
          onClick={e => {
            e.stopPropagation()
            onDelete(job._id, job.name)
          }}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
