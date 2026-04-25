import { useId } from 'react'
import { X, Save, Package, Terminal, Brain, Zap, AlertCircle } from 'lucide-react'
import { useJobEditorForm, type JobConfig } from './job-editor/useJobEditorForm'
import { ExecConfigSection } from './job-editor/ExecConfigSection'
import { AiConfigSection } from './job-editor/AiConfigSection'
import { SkillConfigSection } from './job-editor/SkillConfigSection'
import './JobEditor.css'

interface JobEditorProps {
  jobId?: string
  duplicateFrom?: {
    name: string
    description?: string
    workerType: 'exec' | 'ai' | 'skill'
    config: JobConfig
  }
  onClose: () => void
  onSaved?: () => void
}

function getEditorTitle(
  isEditing: boolean,
  duplicateFrom: JobEditorProps['duplicateFrom']
): string {
  if (isEditing) return 'Edit Job'
  if (duplicateFrom) return 'Duplicate Job'
  return 'Create Job'
}

function WorkerTypeSelector({
  workerType,
  setWorkerType,
  isEditing,
  workerTypeLabelId,
}: {
  workerType: 'exec' | 'ai' | 'skill'
  setWorkerType: (v: 'exec' | 'ai' | 'skill') => void
  isEditing: boolean
  workerTypeLabelId: string
}) {
  return (
    <div className="form-group">
      <span id={workerTypeLabelId} className="form-label">
        Worker Type
      </span>
      <div className="worker-type-selector" role="group" aria-labelledby={workerTypeLabelId}>
        <button
          type="button"
          className={`worker-type-btn ${workerType === 'exec' ? 'active' : ''}`}
          onClick={() => setWorkerType('exec')}
          disabled={isEditing}
        >
          <Terminal size={18} />
          <span>Exec</span>
          <small>Shell commands</small>
        </button>
        <button
          type="button"
          className={`worker-type-btn ${workerType === 'ai' ? 'active' : ''}`}
          onClick={() => setWorkerType('ai')}
          disabled={isEditing}
        >
          <Brain size={18} />
          <span>AI</span>
          <small>LLM prompts</small>
        </button>
        <button
          type="button"
          className={`worker-type-btn ${workerType === 'skill' ? 'active' : ''}`}
          onClick={() => setWorkerType('skill')}
          disabled={isEditing}
        >
          <Zap size={18} />
          <span>Skill</span>
          <small>Claude skills</small>
        </button>
      </div>
      {isEditing && <div className="form-hint">Worker type cannot be changed after creation</div>}
    </div>
  )
}

export function JobEditor({ jobId, duplicateFrom, onClose, onSaved }: JobEditorProps) {
  const workerTypeLabelId = useId()
  const {
    name,
    setName,
    description,
    setDescription,
    workerType,
    setWorkerType,
    command,
    setCommand,
    cwd,
    setCwd,
    timeout,
    setTimeout,
    shell,
    setShell,
    prompt,
    setPrompt,
    ghAccount,
    setGhAccount,
    model,
    setModel,
    targetRepo,
    setTargetRepo,
    skillName,
    setSkillName,
    skillAction,
    setSkillAction,
    skillParams,
    setSkillParams,
    saving,
    error,
    isEditing,
    handleSave,
  } = useJobEditorForm(jobId, duplicateFrom, onSaved, onClose)

  const renderExecConfig = () => (
    <ExecConfigSection
      command={command}
      shell={shell}
      timeout={timeout}
      cwd={cwd}
      onCommandChange={setCommand}
      onShellChange={setShell}
      onTimeoutChange={setTimeout}
      onCwdChange={setCwd}
    />
  )

  const renderAiConfig = () => (
    <AiConfigSection
      prompt={prompt}
      ghAccount={ghAccount}
      model={model}
      targetRepo={targetRepo}
      onPromptChange={setPrompt}
      onGhAccountChange={setGhAccount}
      onModelChange={setModel}
      onTargetRepoChange={setTargetRepo}
    />
  )

  const renderSkillConfig = () => (
    <SkillConfigSection
      skillName={skillName}
      skillAction={skillAction}
      skillParams={skillParams}
      onSkillNameChange={setSkillName}
      onSkillActionChange={setSkillAction}
      onSkillParamsChange={setSkillParams}
    />
  )

  return (
    <div className="job-editor-overlay">
      <div className="job-editor">
        <div className="job-editor-header">
          <div className="job-editor-title">
            <Package size={20} />
            <h2>{getEditorTitle(isEditing, duplicateFrom)}</h2>
          </div>
          <button className="btn-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="job-editor-content">
          {error && (
            <div className="job-editor-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="job-name">Name *</label>
            <input
              id="job-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Daily PR Report"
            />
          </div>

          <div className="form-group">
            <label htmlFor="job-description">Description</label>
            <textarea
              id="job-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description of what this job does"
              rows={2}
            />
          </div>

          <WorkerTypeSelector
            workerType={workerType}
            setWorkerType={setWorkerType}
            isEditing={isEditing}
            workerTypeLabelId={workerTypeLabelId}
          />

          <div className="form-divider" />

          {workerType === 'exec' && renderExecConfig()}
          {workerType === 'ai' && renderAiConfig()}
          {workerType === 'skill' && renderSkillConfig()}
        </div>

        <div className="job-editor-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {/* v8 ignore start */}
            {saving ? 'Saving...' : isEditing ? 'Update Job' : 'Create Job'}
            {/* v8 ignore stop */}
          </button>
        </div>
      </div>
    </div>
  )
}
