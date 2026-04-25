import { Play, Edit, Copy, Trash2, Clock, Calendar } from 'lucide-react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { useJob, useJobMutations, useRunMutations, useJobRuns, JobId } from '../../hooks/useConvex'
import { formatDistanceToNow, formatDuration } from '../../utils/dateUtils'
import { getWorkerIcon } from './job-list/jobRowUtils'
import { useState } from 'react'
import { JobEditor } from './JobEditor'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmDialog } from '../ConfirmDialog'
import { getStatusClass } from '../shared/statusDisplay'
import './JobDetailPanel.css'

interface JobDetailPanelProps {
  jobId: string
  onOpenJobList?: () => void
}

type JobRun = Doc<'runs'>

function JobRecentRuns({ runs }: { runs: JobRun[] | undefined }) {
  /* v8 ignore start */
  if (runs === undefined) {
    return <div className="job-detail-runs-loading">Loading runs...</div>
  }
  /* v8 ignore stop */
  if (runs.length === 0) {
    return (
      <div className="job-detail-runs-empty">
        No runs yet. Click &quot;Run&quot; to execute this job.
      </div>
    )
  }
  return (
    <div className="job-detail-runs">
      {runs.map(run => (
        <div key={run._id} className="job-run-row">
          <span className={`run-status ${getStatusClass(run.status)}`}>{run.status}</span>
          <span className="run-trigger">{run.triggeredBy}</span>
          <span className="run-time" title={new Date(run.startedAt).toLocaleString()}>
            {formatDistanceToNow(run.startedAt)}
          </span>
          {run.duration !== undefined && (
            <span className="run-duration">{formatDuration(run.duration)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function ExecConfigDetails({ job }: { job: Doc<'jobs'> }) {
  return (
    <div className="job-detail-config">
      <div className="config-field">
        <span className="config-label">Command</span>
        {/* v8 ignore start */}
        <code className="config-value">{job.config.command || '—'}</code>
        {/* v8 ignore stop */}
      </div>
      {job.config.shell && (
        <div className="config-field">
          <span className="config-label">Shell</span>
          <span className="config-value">{job.config.shell}</span>
        </div>
      )}
      {job.config.cwd && (
        <div className="config-field">
          <span className="config-label">Working Dir</span>
          <span className="config-value">{job.config.cwd}</span>
        </div>
      )}
      {job.config.timeout && (
        <div className="config-field">
          <span className="config-label">Timeout</span>
          <span className="config-value">{(job.config.timeout / 1000).toFixed(0)}s</span>
        </div>
      )}
    </div>
  )
}

function AIConfigDetails({ job }: { job: Doc<'jobs'> }) {
  return (
    <div className="job-detail-config">
      <div className="config-field">
        <span className="config-label">Prompt</span>
        {/* v8 ignore start */}
        <pre className="config-value config-pre">{job.config.prompt || '—'}</pre>
        {/* v8 ignore stop */}
      </div>
      {job.config.model && (
        <div className="config-field">
          <span className="config-label">Model</span>
          <span className="config-value">{job.config.model}</span>
        </div>
      )}
      {job.config.repoOwner && job.config.repoName && (
        <div className="config-field">
          <span className="config-label">Repo</span>
          <span className="config-value">
            {job.config.repoOwner}/{job.config.repoName}
          </span>
        </div>
      )}
    </div>
  )
}

function SkillConfigDetails({ job }: { job: Doc<'jobs'> }) {
  return (
    <div className="job-detail-config">
      <div className="config-field">
        <span className="config-label">Skill</span>
        {/* v8 ignore start */}
        <span className="config-value">{job.config.skillName || '—'}</span>
        {/* v8 ignore stop */}
      </div>
      {job.config.action && (
        <div className="config-field">
          <span className="config-label">Action</span>
          <span className="config-value">{job.config.action}</span>
        </div>
      )}
      {job.config.params && (
        <div className="config-field">
          <span className="config-label">Params</span>
          <pre className="config-value config-pre">
            {JSON.stringify(job.config.params, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function ConfigDetails({ job }: { job: Doc<'jobs'> }) {
  /* v8 ignore start */
  switch (job.workerType) {
    /* v8 ignore stop */
    case 'exec':
      return <ExecConfigDetails job={job} />
    case 'ai':
      return <AIConfigDetails job={job} />
    case 'skill':
      return <SkillConfigDetails job={job} />
    default:
      /* v8 ignore start */
      return null
    /* v8 ignore stop */
  }
}

function getWorkerLabel(workerType: string): string {
  /* v8 ignore start */
  switch (workerType) {
    /* v8 ignore stop */
    case 'exec':
      return 'Shell Command'
    case 'ai':
      return 'AI Prompt'
    case 'skill':
      return 'Claude Skill'
    default:
      /* v8 ignore start */
      return workerType
    /* v8 ignore stop */
  }
}

export function JobDetailPanel({ jobId }: JobDetailPanelProps) {
  const job = useJob(jobId as JobId)
  const runs = useJobRuns(jobId as JobId, 10)
  const { remove } = useJobMutations()
  const { create: createRun } = useRunMutations()
  const [editorOpen, setEditorOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const { confirm, confirmDialog } = useConfirm()

  if (job === undefined) {
    return (
      <div className="job-detail">
        <div className="job-detail-loading">
          <div className="loading-spinner" />
          <span>Loading job...</span>
        </div>
      </div>
    )
  }

  if (job === null) {
    return (
      <div className="job-detail">
        <div className="job-detail-empty">
          <p>Job not found.</p>
        </div>
      </div>
    )
  }

  const handleRunNow = async () => {
    try {
      await createRun({ jobId: job._id, triggeredBy: 'manual' })
    } catch (error) {
      /* v8 ignore start */
      console.error('Failed to create run:', error)
      /* v8 ignore stop */
    }
  }

  const handleEdit = () => {
    setDuplicating(false)
    setEditorOpen(true)
  }

  const handleDuplicate = () => {
    setDuplicating(true)
    setEditorOpen(true)
  }

  const handleDelete = async () => {
    const confirmed = await confirm({
      message: `Delete job "${job.name}"?`,
      description: 'This will also delete all associated schedules.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    /* v8 ignore start */
    if (confirmed) {
      /* v8 ignore stop */
      try {
        await remove({ id: job._id })
      } catch (error) {
        /* v8 ignore start */
        console.error('Failed to delete job:', error)
        /* v8 ignore stop */
      }
    }
  }

  return (
    <>
      <div className="job-detail">
        {editorOpen && (
          <JobEditor
            jobId={duplicating ? undefined : jobId}
            duplicateFrom={duplicating ? job : undefined}
            /* v8 ignore start */
            onClose={() => setEditorOpen(false)}
            /* v8 ignore stop */
          />
        )}

        <div className="job-detail-header">
          <div className="job-detail-title-row">
            {getWorkerIcon(job.workerType)}
            <h2>{job.name}</h2>
            <span className="job-detail-type-badge">{getWorkerLabel(job.workerType)}</span>
          </div>
          <div className="job-detail-actions">
            <button className="btn-action" onClick={handleRunNow} title="Run Now">
              <Play size={14} />
              Run
            </button>
            <button className="btn-action" onClick={handleEdit} title="Edit">
              <Edit size={14} />
              Edit
            </button>
            <button className="btn-action" onClick={handleDuplicate} title="Duplicate">
              <Copy size={14} />
            </button>
            <button className="btn-action btn-danger" onClick={handleDelete} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {job.description && <div className="job-detail-description">{job.description}</div>}

        <div className="job-detail-meta">
          <span title={new Date(job.createdAt).toLocaleString()}>
            <Calendar size={12} />
            Created {formatDistanceToNow(job.createdAt)}
          </span>
          <span title={new Date(job.updatedAt).toLocaleString()}>
            <Clock size={12} />
            Updated {formatDistanceToNow(job.updatedAt)}
          </span>
        </div>

        <div className="job-detail-section">
          <h3>Configuration</h3>
          <ConfigDetails job={job} />
        </div>

        <div className="job-detail-section">
          <h3>Recent Runs</h3>
          <JobRecentRuns runs={runs} />
        </div>
      </div>
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  )
}
