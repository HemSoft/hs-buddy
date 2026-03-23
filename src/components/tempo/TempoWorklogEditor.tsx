import { useState, useEffect } from 'react'
import type { TempoWorklog, CreateWorklogPayload } from '../../types/tempo'
import { nextStartTime } from './tempoUtils'
import { X } from 'lucide-react'

interface TempoWorklogEditorProps {
  worklog: TempoWorklog | null // null = create mode
  defaultDate: string
  existingWorklogs: TempoWorklog[] // worklogs already on the target date
  onSave: (payload: CreateWorklogPayload) => Promise<void>
  onCancel: () => void
}

export function TempoWorklogEditor({
  worklog,
  defaultDate,
  existingWorklogs,
  onSave,
  onCancel,
}: TempoWorklogEditorProps) {
  const [issueKey, setIssueKey] = useState(worklog?.issueKey || '')
  const [hours, setHours] = useState(String(worklog?.hours || 1))
  const [date, setDate] = useState(worklog?.date || defaultDate)
  const [description, setDescription] = useState(worklog?.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(worklog)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, saving])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const h = parseFloat(hours)
    if (!issueKey.trim()) { setError('Issue key is required'); return }
    if (isNaN(h) || h <= 0 || h > 24) { setError('Hours must be between 0 and 24'); return }
    if (!date) { setError('Date is required'); return }

    setSaving(true)
    setError(null)
    try {
      const startTime = worklog?.startTime || nextStartTime(existingWorklogs)
      await onSave({ issueKey: issueKey.trim().toUpperCase(), hours: h, date, startTime, description })
    } catch (err) {
      setError(String(err))
    }
    setSaving(false)
  }

  return (
    <div className="tempo-editor-overlay" onClick={saving ? undefined : onCancel}>
      <div className="tempo-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="tempo-editor-header">
          <h3>{isEdit ? 'Edit Worklog' : 'Log Time'}</h3>
          <button className="tempo-editor-close" onClick={onCancel} disabled={saving}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="tempo-editor-form">
          <div className="tempo-editor-row">
            <label>Issue Key</label>
            <input
              type="text"
              value={issueKey}
              onChange={e => setIssueKey(e.target.value)}
              placeholder="PE-992"
              disabled={isEdit}
              autoFocus={!isEdit}
            />
          </div>
          <div className="tempo-editor-row-pair">
            <div className="tempo-editor-row">
              <label>Hours</label>
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={hours}
                onChange={e => setHours(e.target.value)}
                autoFocus={isEdit}
              />
            </div>
            <div className="tempo-editor-row">
              <label>Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="tempo-editor-row">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Working on issue..."
            />
          </div>
          {error && <div className="tempo-editor-error">{error}</div>}
          <div className="tempo-editor-actions">
            <button type="button" onClick={onCancel} className="tempo-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="tempo-btn-primary">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
