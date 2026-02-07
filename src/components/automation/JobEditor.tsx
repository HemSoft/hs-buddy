import { useState, useEffect } from 'react'
import { X, Save, Package, Terminal, Brain, Zap, AlertCircle } from 'lucide-react'
import { useJob, useJobMutations, JobId } from '../../hooks/useConvex'
import './JobEditor.css'

interface JobEditorProps {
  jobId?: string // If provided, editing; otherwise creating
  duplicateFrom?: {
    name: string
    description?: string
    workerType: 'exec' | 'ai' | 'skill'
    config: JobConfig
  }
  onClose: () => void
  onSaved?: () => void
}

interface JobConfig {
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

export function JobEditor({ jobId, duplicateFrom, onClose, onSaved }: JobEditorProps) {
  const existingJob = useJob(jobId as JobId | undefined)
  const { create, update } = useJobMutations()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [workerType, setWorkerType] = useState<'exec' | 'ai' | 'skill'>('exec')
  
  // exec config
  const [command, setCommand] = useState('')
  const [cwd, setCwd] = useState('')
  const [timeout, setTimeout] = useState(60000)
  const [shell, setShell] = useState<'powershell' | 'bash' | 'cmd'>('powershell')
  
  // ai config
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('claude-sonnet-4.5')
  const [maxTokens, setMaxTokens] = useState(4096)
  const [temperature, setTemperature] = useState(0.7)
  
  // skill config
  const [skillName, setSkillName] = useState('')
  const [skillAction, setSkillAction] = useState('')
  const [skillParams, setSkillParams] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!jobId

  // Populate form when editing or duplicating
  useEffect(() => {
    const source = existingJob || duplicateFrom
    if (source) {
      setName(duplicateFrom ? `${source.name} (Copy)` : source.name)
      setDescription(source.description || '')
      setWorkerType(source.workerType)
      
      // Populate config based on worker type
      if (source.config) {
        if (source.config.command) setCommand(source.config.command)
        if (source.config.cwd) setCwd(source.config.cwd)
        if (source.config.timeout) setTimeout(source.config.timeout)
        if (source.config.shell) setShell(source.config.shell)
        
        if (source.config.prompt) setPrompt(source.config.prompt)
        if (source.config.model) setModel(source.config.model)
        if (source.config.maxTokens) setMaxTokens(source.config.maxTokens)
        if (source.config.temperature !== undefined) setTemperature(source.config.temperature)
        
        if (source.config.skillName) setSkillName(source.config.skillName)
        if (source.config.action) setSkillAction(source.config.action)
        if (source.config.params) setSkillParams(JSON.stringify(source.config.params, null, 2))
      }
    }
  }, [existingJob, duplicateFrom])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const buildConfig = (): JobConfig => {
    switch (workerType) {
      case 'exec':
        return {
          command: command.trim(),
          cwd: cwd.trim() || undefined,
          timeout: timeout || undefined,
          shell,
        }
      case 'ai':
        return {
          prompt: prompt.trim(),
          model: model.trim() || undefined,
          maxTokens: maxTokens || undefined,
          temperature,
        }
      case 'skill': {
        let params: unknown = undefined
        if (skillParams.trim()) {
          try {
            params = JSON.parse(skillParams)
          } catch {
            throw new Error('Invalid JSON in parameters')
          }
        }
        return {
          skillName: skillName.trim(),
          action: skillAction.trim() || undefined,
          params,
        }
      }
    }
  }

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      setError('Job name is required')
      return
    }

    // Validate worker-specific fields
    switch (workerType) {
      case 'exec':
        if (!command.trim()) {
          setError('Command is required for exec jobs')
          return
        }
        break
      case 'ai':
        if (!prompt.trim()) {
          setError('Prompt is required for AI jobs')
          return
        }
        break
      case 'skill':
        if (!skillName.trim()) {
          setError('Skill name is required for skill jobs')
          return
        }
        break
    }

    setError(null)
    setSaving(true)

    try {
      const config = buildConfig()

      if (isEditing && jobId) {
        await update({
          id: jobId as JobId,
          name: name.trim(),
          description: description.trim() || undefined,
          workerType,
          config,
        })
      } else {
        await create({
          name: name.trim(),
          description: description.trim() || undefined,
          workerType,
          config,
        })
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job')
    } finally {
      setSaving(false)
    }
  }

  const renderExecConfig = () => (
    <>
      <div className="form-group">
        <label htmlFor="job-command">Command *</label>
        <textarea
          id="job-command"
          value={command}
          onChange={e => setCommand(e.target.value)}
          placeholder="e.g., Get-Process | Select-Object -First 10"
          rows={3}
          className="mono"
        />
        <div className="form-hint">The shell command to execute</div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label htmlFor="job-shell">Shell</label>
          <select
            id="job-shell"
            value={shell}
            onChange={e => setShell(e.target.value as 'powershell' | 'bash' | 'cmd')}
          >
            <option value="powershell">PowerShell</option>
            <option value="bash">Bash</option>
            <option value="cmd">CMD</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="job-timeout">Timeout (ms)</label>
          <input
            id="job-timeout"
            type="number"
            value={timeout}
            onChange={e => setTimeout(parseInt(e.target.value) || 60000)}
            min={1000}
            step={1000}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="job-cwd">Working Directory</label>
        <input
          id="job-cwd"
          type="text"
          value={cwd}
          onChange={e => setCwd(e.target.value)}
          placeholder="e.g., C:\Projects\MyApp (optional)"
        />
        <div className="form-hint">Leave empty to use the app's working directory</div>
      </div>
    </>
  )

  const renderAiConfig = () => (
    <>
      <div className="form-group">
        <label htmlFor="job-prompt">Prompt *</label>
        <textarea
          id="job-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Enter the prompt for the AI model..."
          rows={6}
        />
      </div>

      <div className="form-group">
        <label htmlFor="job-model">Model</label>
        <select
          id="job-model"
          value={model}
          onChange={e => setModel(e.target.value)}
        >
          <optgroup label="Anthropic">
            <option value="claude-sonnet-4.5">Claude Sonnet 4.5</option>
            <option value="claude-opus-4.5">Claude Opus 4.5</option>
            <option value="claude-haiku-4.5">Claude Haiku 4.5</option>
          </optgroup>
          <optgroup label="OpenAI">
            <option value="gpt-5.2">GPT-5.2</option>
            <option value="gpt-5-mini">GPT-5 Mini (Free)</option>
            <option value="gpt-5.1-codex-max">GPT-5.1 Codex Max</option>
          </optgroup>
          <optgroup label="Google">
            <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
          </optgroup>
        </select>
        <div className="form-hint">Models are accessed via GitHub Copilot</div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label htmlFor="job-max-tokens">Max Tokens</label>
          <input
            id="job-max-tokens"
            type="number"
            value={maxTokens}
            onChange={e => setMaxTokens(parseInt(e.target.value) || 4096)}
            min={1}
            max={100000}
          />
        </div>

        <div className="form-group">
          <label htmlFor="job-temperature">Temperature</label>
          <input
            id="job-temperature"
            type="number"
            value={temperature}
            onChange={e => setTemperature(parseFloat(e.target.value) || 0.7)}
            min={0}
            max={2}
            step={0.1}
          />
        </div>
      </div>
    </>
  )

  const renderSkillConfig = () => (
    <>
      <div className="form-group">
        <label htmlFor="job-skill-name">Skill Name *</label>
        <input
          id="job-skill-name"
          type="text"
          value={skillName}
          onChange={e => setSkillName(e.target.value)}
          placeholder="e.g., todoist, github, diary"
        />
        <div className="form-hint">Name of the Claude skill to execute</div>
      </div>

      <div className="form-group">
        <label htmlFor="job-skill-action">Action</label>
        <input
          id="job-skill-action"
          type="text"
          value={skillAction}
          onChange={e => setSkillAction(e.target.value)}
          placeholder="e.g., list, create, sync (optional)"
        />
        <div className="form-hint">Specific action within the skill</div>
      </div>

      <div className="form-group">
        <label htmlFor="job-skill-params">Parameters (JSON)</label>
        <textarea
          id="job-skill-params"
          value={skillParams}
          onChange={e => setSkillParams(e.target.value)}
          placeholder='e.g., {"projectId": "123", "filter": "today"}'
          rows={4}
          className="mono"
        />
        <div className="form-hint">Optional JSON parameters to pass to the skill</div>
      </div>
    </>
  )

  return (
    <div className="job-editor-overlay" onClick={handleOverlayClick}>
      <div className="job-editor">
        <div className="job-editor-header">
          <div className="job-editor-title">
            <Package size={20} />
            <h2>{isEditing ? 'Edit Job' : duplicateFrom ? 'Duplicate Job' : 'Create Job'}</h2>
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
              autoFocus
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

          <div className="form-group">
            <label>Worker Type</label>
            <div className="worker-type-selector">
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
            {isEditing && (
              <div className="form-hint">Worker type cannot be changed after creation</div>
            )}
          </div>

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
            {saving ? 'Saving...' : isEditing ? 'Update Job' : 'Create Job'}
          </button>
        </div>
      </div>
    </div>
  )
}
