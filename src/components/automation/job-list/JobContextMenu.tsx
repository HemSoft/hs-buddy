import { Play, Edit, Copy, Trash2 } from 'lucide-react'
import type { Job, JobId } from './types'

interface JobContextMenuProps {
  x: number
  y: number
  job: Job
  onRunNow: (job: Job) => void
  onEdit: (jobId: JobId) => void
  onDuplicate: (job: Job) => void
  onDelete: (jobId: JobId, name: string) => void
  onClose: () => void
}

export function JobContextMenu({
  x,
  y,
  job,
  onRunNow,
  onEdit,
  onDuplicate,
  onDelete,
  onClose,
}: JobContextMenuProps) {
  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div className="context-menu" style={{ top: y, left: x }}>
        <button onClick={() => onRunNow(job)}>
          <Play size={14} />
          Run Now
        </button>
        <button onClick={() => onEdit(job._id)}>
          <Edit size={14} />
          Edit
        </button>
        <button onClick={() => onDuplicate(job)}>
          <Copy size={14} />
          Duplicate
        </button>
        <div className="context-menu-separator" />
        <button
          className="danger"
          onClick={() => onDelete(job._id, job.name)}
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </>
  )
}
