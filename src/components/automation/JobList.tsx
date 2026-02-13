import { useState } from 'react'
import { Package, Terminal, Brain, Zap, Plus, Trash2, Copy, Play, Edit } from 'lucide-react'
import { useJobs, useJobMutations, useRunMutations, JobId } from '../../hooks/useConvex'
import { JobEditor } from './JobEditor'
import './JobList.css'

// Job type matching Convex schema
interface Job {
  _id: JobId
  _creationTime: number
  name: string
  description?: string
  workerType: 'exec' | 'ai' | 'skill'
  config: {
    // exec-worker
    command?: string
    cwd?: string
    timeout?: number
    shell?: 'powershell' | 'bash' | 'cmd'
    // ai-worker
    prompt?: string
    model?: string
    maxTokens?: number
    temperature?: number
    // skill-worker
    skillName?: string
    action?: string
    params?: unknown
  }
  inputParams?: {
    name: string
    type: 'string' | 'number' | 'boolean'
    defaultValue?: unknown
    required: boolean
    description?: string
  }[]
  createdAt: number
  updatedAt: number
}

interface JobListProps {
  createTrigger?: number // Increment to trigger create dialog
}

export function JobList({ createTrigger }: JobListProps) {
  const jobs = useJobs()
  const { remove } = useJobMutations()
  const { create: createRun } = useRunMutations()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingJobId, setEditingJobId] = useState<JobId | undefined>()
  const [duplicateJob, setDuplicateJob] = useState<Job | undefined>()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; job: Job } | null>(null)
  const [lastCreateTrigger, setLastCreateTrigger] = useState(0)

  // Open create dialog when createTrigger changes
  if (createTrigger && createTrigger > lastCreateTrigger) {
    setLastCreateTrigger(createTrigger)
    setEditingJobId(undefined)
    setDuplicateJob(undefined)
    setEditorOpen(true)
  }

  const handleCreate = () => {
    setEditingJobId(undefined)
    setDuplicateJob(undefined)
    setEditorOpen(true)
  }

  const handleEdit = (jobId: JobId) => {
    setEditingJobId(jobId)
    setDuplicateJob(undefined)
    setEditorOpen(true)
    setContextMenu(null)
  }

  const handleDuplicate = (job: Job) => {
    setEditingJobId(undefined)
    setDuplicateJob(job)
    setEditorOpen(true)
    setContextMenu(null)
  }

  const handleEditorClose = () => {
    setEditorOpen(false)
    setEditingJobId(undefined)
    setDuplicateJob(undefined)
  }

  const handleDelete = async (jobId: JobId, name: string) => {
    if (confirm(`Delete job "${name}"?\n\nThis will also delete all associated schedules.`)) {
      try {
        await remove({ id: jobId })
      } catch (error) {
        console.error('Failed to delete job:', error)
      }
    }
    setContextMenu(null)
  }

  const handleRunNow = async (job: Job) => {
    try {
      await createRun({
        jobId: job._id,
        triggeredBy: 'manual',
      })
      // Could show a toast notification here
    } catch (error) {
      console.error('Failed to create run:', error)
    }
    setContextMenu(null)
  }

  const handleContextMenu = (e: React.MouseEvent, job: Job) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, job })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  // Close context menu when clicking outside
  const handleOverlayClick = () => {
    closeContextMenu()
  }

  const getWorkerIcon = (workerType: 'exec' | 'ai' | 'skill') => {
    switch (workerType) {
      case 'exec':
        return <Terminal size={16} className="worker-icon worker-exec" />
      case 'ai':
        return <Brain size={16} className="worker-icon worker-ai" />
      case 'skill':
        return <Zap size={16} className="worker-icon worker-skill" />
    }
  }

  const getConfigPreview = (job: Job): string => {
    switch (job.workerType) {
      case 'exec':
        return job.config.command || 'No command'
      case 'ai':
        if (job.config.prompt) {
          const truncated = job.config.prompt.length > 50
            ? job.config.prompt.substring(0, 50) + '...'
            : job.config.prompt
          return truncated
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

  if (jobs === undefined) {
    return (
      <div className="job-list">
        <div className="job-list-loading">
          <div className="loading-spinner" />
          <span>Loading jobs...</span>
        </div>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="job-list">
        <div className="job-list-empty">
          <Package size={48} strokeWidth={1.5} />
          <h3>No Jobs</h3>
          <p>Create your first job to define tasks that can be scheduled or run manually.</p>
          <button className="btn-primary" onClick={handleCreate}>
            <Plus size={16} />
            Create Job
          </button>
          {editorOpen && (
            <JobEditor
              jobId={editingJobId}
              duplicateFrom={duplicateJob}
              onClose={handleEditorClose}
            />
          )}
        </div>
      </div>
    )
  }

  // Group jobs by type
  const groupedJobs = {
    exec: (jobs as Job[]).filter(w => w.workerType === 'exec'),
    ai: (jobs as Job[]).filter(w => w.workerType === 'ai'),
    skill: (jobs as Job[]).filter(w => w.workerType === 'skill'),
  }

  const renderJobRow = (job: Job) => (
    <div
      key={job._id}
      className="job-row"
      onContextMenu={(e) => handleContextMenu(e, job)}
      onClick={() => handleEdit(job._id)}
      title={job.description || job.name}
    >
      {getWorkerIcon(job.workerType)}
      <span className="job-row-name">{job.name}</span>
      <span className="job-row-preview">{getConfigPreview(job)}</span>
      <div className="job-row-actions">
        <button
          className="btn-icon-sm"
          onClick={(e) => { e.stopPropagation(); handleRunNow(job) }}
          title="Run Now"
        >
          <Play size={14} />
        </button>
        <button
          className="btn-icon-sm"
          onClick={(e) => { e.stopPropagation(); handleDuplicate(job) }}
          title="Duplicate"
        >
          <Copy size={14} />
        </button>
        <button
          className="btn-icon-sm btn-danger"
          onClick={(e) => { e.stopPropagation(); handleDelete(job._id, job.name) }}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="job-list">
      <div className="job-list-header">
        <h2>Jobs</h2>
        <button className="btn-icon" onClick={handleCreate} title="Create Job">
          <Plus size={18} />
        </button>
      </div>

      {editorOpen && (
        <JobEditor
          jobId={editingJobId}
          duplicateFrom={duplicateJob}
          onClose={handleEditorClose}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={handleOverlayClick} />
          <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button onClick={() => handleRunNow(contextMenu.job)}>
              <Play size={14} />
              Run Now
            </button>
            <button onClick={() => handleEdit(contextMenu.job._id)}>
              <Edit size={14} />
              Edit
            </button>
            <button onClick={() => handleDuplicate(contextMenu.job)}>
              <Copy size={14} />
              Duplicate
            </button>
            <div className="context-menu-separator" />
            <button
              className="danger"
              onClick={() => handleDelete(contextMenu.job._id, contextMenu.job.name)}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </>
      )}

      <div className="job-list-content">
        {groupedJobs.exec.length > 0 && (
          <div className="job-group">
            <div className="job-group-header">
              <Terminal size={14} />
              <span>Shell Commands</span>
              <span className="job-group-count">{groupedJobs.exec.length}</span>
            </div>
            <div className="job-group-items">
              {groupedJobs.exec.map(renderJobRow)}
            </div>
          </div>
        )}

        {groupedJobs.ai.length > 0 && (
          <div className="job-group">
            <div className="job-group-header">
              <Brain size={14} />
              <span>AI Prompts</span>
              <span className="job-group-count">{groupedJobs.ai.length}</span>
            </div>
            <div className="job-group-items">
              {groupedJobs.ai.map(renderJobRow)}
            </div>
          </div>
        )}

        {groupedJobs.skill.length > 0 && (
          <div className="job-group">
            <div className="job-group-header">
              <Zap size={14} />
              <span>Claude Skills</span>
              <span className="job-group-count">{groupedJobs.skill.length}</span>
            </div>
            <div className="job-group-items">
              {groupedJobs.skill.map(renderJobRow)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
