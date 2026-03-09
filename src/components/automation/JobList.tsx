import { useState, useEffect, useCallback } from 'react'
import { Package, Terminal, Brain, Zap, Plus } from 'lucide-react'
import { useJobs, useJobMutations, useRunMutations, useJobRunCounts } from '../../hooks/useConvex'
import { JobEditor } from './JobEditor'
import { JobRow } from './job-list/JobRow'
import { JobContextMenu } from './job-list/JobContextMenu'
import type { Job, JobId } from './job-list/types'
import './JobList.css'

interface JobListProps {
  createTrigger?: number // Increment to trigger create dialog
}

export function JobList({ createTrigger }: JobListProps) {
  const jobs = useJobs()
  const { remove } = useJobMutations()
  const { create: createRun } = useRunMutations()
  const runCounts = useJobRunCounts()
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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // Close context menu when clicking outside - handled by JobContextMenu overlay

  useEffect(() => {
    if (!contextMenu) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu, closeContextMenu])

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

  const jobGroupConfig = [
    { type: 'exec' as const, icon: <Terminal size={14} />, label: 'Shell Commands' },
    { type: 'ai' as const, icon: <Brain size={14} />, label: 'AI Prompts' },
    { type: 'skill' as const, icon: <Zap size={14} />, label: 'Claude Skills' },
  ]

  return (
    <div className="job-list">
      <div className="job-list-header">
        <h2>Jobs</h2>
        <button className="btn-icon" onClick={handleCreate} title="Create Job">
          <Plus size={18} />
        </button>
      </div>

      {editorOpen && (
        <JobEditor jobId={editingJobId} duplicateFrom={duplicateJob} onClose={handleEditorClose} />
      )}

      {contextMenu && (
        <JobContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          job={contextMenu.job}
          onRunNow={handleRunNow}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onClose={closeContextMenu}
        />
      )}

      <div className="job-list-content">
        {jobGroupConfig.map(({ type, icon, label }) => {
          const typeJobs = groupedJobs[type]
          if (typeJobs.length === 0) return null
          return (
            <div key={type} className="job-group">
              <div className="job-group-header">
                {icon}
                <span>{label}</span>
                <span className="job-group-count">{typeJobs.length}</span>
              </div>
              <div className="job-group-items">
                {typeJobs.map(job => (
                  <JobRow
                    key={job._id}
                    job={job}
                    runCounts={runCounts?.[job._id]}
                    onEdit={handleEdit}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onRunNow={handleRunNow}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
