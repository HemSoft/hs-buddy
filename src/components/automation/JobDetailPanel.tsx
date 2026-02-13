import { Terminal, Brain, Zap, Play, Edit, Copy, Trash2, Clock, Calendar } from 'lucide-react'
import { useJob, useJobMutations, useRunMutations, useJobRuns, JobId } from '../../hooks/useConvex'
import { formatDistanceToNow } from '../../utils/dateUtils'
import { useState } from 'react'
import { JobEditor } from './JobEditor'
import './JobDetailPanel.css'

interface JobDetailPanelProps {
  jobId: string
  onOpenJobList?: () => void
}

export function JobDetailPanel({ jobId }: JobDetailPanelProps) {
  const job = useJob(jobId as JobId)
  const runs = useJobRuns(jobId as JobId, 10)
  const { remove } = useJobMutations()
  const { create: createRun } = useRunMutations()
  const [editorOpen, setEditorOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

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

  const getWorkerIcon = (workerType: string) => {
    switch (workerType) {
      case 'exec': return <Terminal size={16} className="worker-icon worker-exec" />
      case 'ai': return <Brain size={16} className="worker-icon worker-ai" />
      case 'skill': return <Zap size={16} className="worker-icon worker-skill" />
      default: return null
    }
  }

  const getWorkerLabel = (workerType: string) => {
    switch (workerType) {
      case 'exec': return 'Shell Command'
      case 'ai': return 'AI Prompt'
      case 'skill': return 'Claude Skill'
      default: return workerType
    }
  }

  const handleRunNow = async () => {
    try {
      await createRun({ jobId: job._id, triggeredBy: 'manual' })
    } catch (error) {
      console.error('Failed to create run:', error)
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
    if (confirm(`Delete job "${job.name}"?\n\nThis will also delete all associated schedules.`)) {
      try {
        await remove({ id: job._id })
      } catch (error) {
        console.error('Failed to delete job:', error)
      }
    }
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'completed': return 'status-completed'
      case 'failed': return 'status-failed'
      case 'running': return 'status-running'
      case 'pending': return 'status-pending'
      case 'cancelled': return 'status-cancelled'
      default: return ''
    }
  }

  const renderConfigDetails = () => {
    switch (job.workerType) {
      case 'exec':
        return (
          <div className="job-detail-config">
            <div className="config-field">
              <span className="config-label">Command</span>
              <code className="config-value">{job.config.command || '—'}</code>
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
      case 'ai':
        return (
          <div className="job-detail-config">
            <div className="config-field">
              <span className="config-label">Prompt</span>
              <pre className="config-value config-pre">{job.config.prompt || '—'}</pre>
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
                <span className="config-value">{job.config.repoOwner}/{job.config.repoName}</span>
              </div>
            )}
          </div>
        )
      case 'skill':
        return (
          <div className="job-detail-config">
            <div className="config-field">
              <span className="config-label">Skill</span>
              <span className="config-value">{job.config.skillName || '—'}</span>
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
                <pre className="config-value config-pre">{JSON.stringify(job.config.params, null, 2)}</pre>
              </div>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="job-detail">
      {editorOpen && (
        <JobEditor
          jobId={duplicating ? undefined : jobId}
          duplicateFrom={duplicating ? job : undefined}
          onClose={() => setEditorOpen(false)}
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

      {job.description && (
        <div className="job-detail-description">{job.description}</div>
      )}

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
        {renderConfigDetails()}
      </div>

      <div className="job-detail-section">
        <h3>Recent Runs</h3>
        {runs === undefined ? (
          <div className="job-detail-runs-loading">Loading runs...</div>
        ) : runs.length === 0 ? (
          <div className="job-detail-runs-empty">No runs yet. Click "Run" to execute this job.</div>
        ) : (
          <div className="job-detail-runs">
            {runs.map(run => (
              <div key={run._id} className="job-run-row">
                <span className={`run-status ${getStatusClass(run.status)}`}>{run.status}</span>
                <span className="run-trigger">{run.triggeredBy}</span>
                <span className="run-time" title={new Date(run.startedAt).toLocaleString()}>
                  {formatDistanceToNow(run.startedAt)}
                </span>
                {run.duration !== undefined && (
                  <span className="run-duration">
                    {run.duration < 1000
                      ? `${run.duration}ms`
                      : `${(run.duration / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
