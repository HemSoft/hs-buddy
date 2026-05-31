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
      <fieldset className="worker-type-selector" aria-labelledby={workerTypeLabelId}>
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
      </fieldset>
      {isEditing && <div className="form-hint">Worker type cannot be changed after creation</div>}
    </div>
  )
}

function JobEditorError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="job-editor-error">
      <AlertCircle size={16} />
      <span>{error}</span>
    </div>
  )
}

interface JobConfigFieldsProps {
  workerType: 'exec' | 'ai' | 'skill'
  command: string
  shell: 'powershell' | 'bash' | 'cmd'
  timeout: number
  cwd: string
  setCommand: (value: string) => void
  setShell: (value: 'powershell' | 'bash' | 'cmd') => void
  setTimeout: (value: number) => void
  setCwd: (value: string) => void
  prompt: string
  ghAccount: string
  model: string
  targetRepo: string
  setPrompt: (value: string) => void
  setGhAccount: (value: string) => void
  setModel: (value: string) => void
  setTargetRepo: (value: string) => void
  skillName: string
  skillAction: string
  skillParams: string
  setSkillName: (value: string) => void
  setSkillAction: (value: string) => void
  setSkillParams: (value: string) => void
}

function JobConfigFields({
  workerType,
  command,
  shell,
  timeout,
  cwd,
  setCommand,
  setShell,
  setTimeout,
  setCwd,
  prompt,
  ghAccount,
  model,
  targetRepo,
  setPrompt,
  setGhAccount,
  setModel,
  setTargetRepo,
  skillName,
  skillAction,
  skillParams,
  setSkillName,
  setSkillAction,
  setSkillParams,
}: JobConfigFieldsProps) {
  switch (workerType) {
    case 'exec':
      return (
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
    case 'ai':
      return (
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
    case 'skill':
      return (
        <SkillConfigSection
          skillName={skillName}
          skillAction={skillAction}
          skillParams={skillParams}
          onSkillNameChange={setSkillName}
          onSkillActionChange={setSkillAction}
          onSkillParamsChange={setSkillParams}
        />
      )
  }
}

function getSaveJobLabel(saving: boolean, isEditing: boolean): string {
  if (saving) return 'Saving…'
  return isEditing ? 'Update Job' : 'Create Job'
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

  return (
    <div className="job-editor-overlay">
      <div className="job-editor">
        <div className="job-editor-header">
          <div className="job-editor-title">
            <Package size={20} />
            <h2>{getEditorTitle(isEditing, duplicateFrom)}</h2>
          </div>
          <button
            aria-label="Close"
            type="button"
            className="btn-close"
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="job-editor-content">
          <JobEditorError error={error} />
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
          <JobConfigFields
            workerType={workerType}
            command={command}
            shell={shell}
            timeout={timeout}
            cwd={cwd}
            setCommand={setCommand}
            setShell={setShell}
            setTimeout={setTimeout}
            setCwd={setCwd}
            prompt={prompt}
            ghAccount={ghAccount}
            model={model}
            targetRepo={targetRepo}
            setPrompt={setPrompt}
            setGhAccount={setGhAccount}
            setModel={setModel}
            setTargetRepo={setTargetRepo}
            skillName={skillName}
            skillAction={skillAction}
            skillParams={skillParams}
            setSkillName={setSkillName}
            setSkillAction={setSkillAction}
            setSkillParams={setSkillParams}
          />
        </div>
        <div className="job-editor-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {getSaveJobLabel(saving, isEditing)}
          </button>
        </div>
      </div>
    </div>
  )
}
