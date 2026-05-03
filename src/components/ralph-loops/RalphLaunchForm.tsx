import { useState, useMemo, useEffect } from 'react'
import { Play, FolderOpen } from 'lucide-react'
import { useRalphModels, useRalphAgents, useRalphProviders } from '../../hooks/useRalphConfig'
import { safeGetItem, safeSetItem } from '../../utils/storage'
import type {
  RalphLaunchConfig,
  RalphLaunchResult,
  RalphModelsConfig,
  RalphProvider,
  RalphProviderEntry,
  RalphTemplateInfo,
} from '../../types/ralph'

interface RalphLaunchFormProps {
  initialScript?: string | null
  initialPR?: { prNumber: number; repository: string; org: string; repoPath: string } | null
  initialIssue?: {
    issueNumber: number
    issueTitle: string
    issueBody: string
    repository: string
    org: string
    repoPath: string
  } | null
  onLaunch?: (config: RalphLaunchConfig) => Promise<RalphLaunchResult>
}

type ScriptChoice = 'ralph' | 'ralph-pr' | 'ralph-issues' | string

interface ReviewerModelGroup {
  provider: string
  label: string
  options: { value: string; label: string }[]
}

function buildProviderModelGroup(
  provKey: string,
  prov: RalphProviderEntry,
  models: RalphModelsConfig
): ReviewerModelGroup | null {
  const supported = prov.supportedModelProviders ?? []
  const opts: { value: string; label: string }[] = []
  for (const [modelKey, m] of Object.entries(models.models)) {
    if (supported.includes(m.provider)) {
      opts.push({ value: `${provKey}:${modelKey}`, label: `${m.label} (${m.reasoningEffort})` })
    }
  }
  for (const [alias, target] of Object.entries(models.aliases)) {
    if (models.models[target] && supported.includes(models.models[target].provider)) {
      opts.push({ value: `${provKey}:${alias}`, label: `${alias} → ${target}` })
    }
  }
  return opts.length > 0
    ? { provider: provKey, label: prov.description ?? provKey, options: opts }
    : null
}

interface LaunchFormValues {
  repoPath: string
  scriptChoice: ScriptChoice
  model: string
  provider: string
  devAgent: string
  reviewAgents: string[]
  reviewerModels: Record<string, string>
  iterations: number
  repeats: number
  branch: string
  prompt: string
  prNumber: string
  issueNumber: string
  labels: string
  dryRun: boolean
  autoApprove: boolean
}

function resolveScriptType(choice: ScriptChoice): {
  scriptType: RalphLaunchConfig['scriptType']
  templateScript?: string
} {
  const isTemplate = choice !== 'ralph' && choice !== 'ralph-pr' && choice !== 'ralph-issues'
  return isTemplate
    ? { scriptType: 'template', templateScript: choice }
    : { scriptType: choice as RalphLaunchConfig['scriptType'] }
}

function buildRunFields(opts: LaunchFormValues): Partial<RalphLaunchConfig> {
  const trimmedPrompt = opts.prompt.trim()
  return {
    ...(opts.repeats > 1 && { repeats: opts.repeats }),
    ...(opts.branch && { branch: opts.branch }),
    ...(trimmedPrompt && { prompt: trimmedPrompt }),
    ...(opts.labels.trim() && { labels: opts.labels.trim() }),
    ...(opts.dryRun && { dryRun: true }),
    ...(opts.autoApprove && { autoApprove: true }),
  }
}

function buildOptionalFields(opts: LaunchFormValues): Partial<RalphLaunchConfig> {
  const reviewerSpecs = opts.reviewAgents.map(role => {
    const m = opts.reviewerModels[role]
    return m ? `${role}@${m}` : role
  })
  return {
    ...(opts.model && { model: opts.model }),
    ...((opts.provider as RalphProvider) && { provider: opts.provider as RalphProvider }),
    ...(opts.devAgent && { devAgent: opts.devAgent }),
    ...(reviewerSpecs.length > 0 && { agents: reviewerSpecs }),
    ...buildRunFields(opts),
  }
}

function buildLaunchConfig(opts: LaunchFormValues): RalphLaunchConfig {
  const prNum = opts.prNumber ? Number(opts.prNumber) : undefined
  const issueNum = opts.issueNumber ? Number(opts.issueNumber) : undefined
  return {
    repoPath: opts.repoPath,
    ...resolveScriptType(opts.scriptChoice),
    iterations: opts.iterations,
    ...(prNum && { prNumber: prNum }),
    ...(issueNum && { issueNumber: issueNum }),
    ...buildOptionalFields(opts),
  }
}

/* ── Extracted form sub-components ────────────────────────────── */

function ScriptSpecificFields({
  scriptChoice,
  prNumber,
  onPrNumberChange,
  labels,
  onLabelsChange,
  dryRun,
  onDryRunChange,
}: {
  scriptChoice: ScriptChoice
  prNumber: string
  onPrNumberChange: (v: string) => void
  labels: string
  onLabelsChange: (v: string) => void
  dryRun: boolean
  onDryRunChange: (v: boolean) => void
}) {
  if (scriptChoice === 'ralph-pr') {
    return (
      <div className="ralph-form-field">
        <label htmlFor="ralph-pr-number">
          PR Number
          <span className="ralph-form-hint">required — the existing PR to resolve</span>
        </label>
        <input
          id="ralph-pr-number"
          type="number"
          min={1}
          value={prNumber}
          onChange={e => onPrNumberChange(e.target.value)}
          placeholder="e.g. 42"
        />
      </div>
    )
  }
  if (scriptChoice === 'ralph-issues') {
    return (
      <>
        <div className="ralph-form-field">
          <label htmlFor="ralph-labels">
            Labels
            <span className="ralph-form-hint">comma-separated issue labels</span>
          </label>
          <input
            id="ralph-labels"
            type="text"
            value={labels}
            onChange={e => onLabelsChange(e.target.value)}
            placeholder="e.g. tech-debt,automated"
          />
        </div>
        <div className="ralph-form-field ralph-form-checkbox">
          <label htmlFor="ralph-dryrun">
            <input
              id="ralph-dryrun"
              type="checkbox"
              checked={dryRun}
              onChange={e => onDryRunChange(e.target.checked)}
            />
            Dry Run
            <span className="ralph-form-hint">scan only — don&apos;t create issues</span>
          </label>
        </div>
      </>
    )
  }
  return null
}

function IterationsRow({
  scriptChoice,
  iterations,
  onIterationsChange,
  repeats,
  onRepeatsChange,
}: {
  scriptChoice: ScriptChoice
  iterations: number
  onIterationsChange: (v: number) => void
  repeats: number
  onRepeatsChange: (v: number) => void
}) {
  const isIssues = scriptChoice === 'ralph-issues'
  return (
    <div className="ralph-form-row">
      <div className="ralph-form-field">
        <label htmlFor="ralph-iterations">
          {isIssues ? 'Scan Iterations' : 'Work Iterations'}
          <span className="ralph-form-hint">
            {isIssues ? 'max scan passes' : 'coding passes on same branch'}
          </span>
        </label>
        <input
          id="ralph-iterations"
          type="number"
          min={1}
          max={100}
          value={iterations}
          onChange={e => onIterationsChange(Number(e.target.value))}
          disabled={scriptChoice === 'ralph-pr'}
        />
      </div>

      <div className="ralph-form-field">
        <label htmlFor="ralph-repeats">
          Repeat Cycles
          <span className="ralph-form-hint">full work→PR cycles</span>
        </label>
        <input
          id="ralph-repeats"
          type="number"
          min={1}
          max={50}
          value={repeats}
          onChange={e => onRepeatsChange(Number(e.target.value))}
          disabled={scriptChoice === 'ralph-pr' || scriptChoice === 'ralph-issues'}
        />
      </div>
    </div>
  )
}

function ModelProviderRow({
  model,
  onModelChange,
  provider,
  onProviderChange,
  modelOptions,
  providerOptions,
  defaultModel,
  defaultProvider,
}: {
  model: string
  onModelChange: (v: string) => void
  provider: string
  onProviderChange: (v: string) => void
  modelOptions: { value: string; label: string }[]
  providerOptions: { value: string; label: string }[]
  defaultModel: string | undefined
  defaultProvider: string | undefined
}) {
  return (
    <div className="ralph-form-row">
      <div className="ralph-form-field">
        <label htmlFor="ralph-model">Model</label>
        <select id="ralph-model" value={model} onChange={e => onModelChange(e.target.value)}>
          <option value="">Default ({defaultModel ?? '…'})</option>
          {modelOptions.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="ralph-form-field">
        <label htmlFor="ralph-provider">Provider</label>
        <select
          id="ralph-provider"
          value={provider}
          onChange={e => onProviderChange(e.target.value)}
        >
          <option value="">Default ({defaultProvider ?? '…'})</option>
          {providerOptions.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ScriptSelect({
  value,
  onChange,
  templates,
}: {
  value: ScriptChoice
  onChange: (v: ScriptChoice) => void
  templates: RalphTemplateInfo[]
}) {
  return (
    <div className="ralph-form-field">
      <label htmlFor="ralph-script">Script</label>
      <select id="ralph-script" value={value} onChange={e => onChange(e.target.value)}>
        <option value="ralph">ralph (full loop)</option>
        <option value="ralph-pr">ralph-pr (PR only)</option>
        <option value="ralph-issues">ralph-issues (scan & create issues)</option>
        {templates.length > 0 && (
          <optgroup label="Templates">
            {templates.map(t => (
              <option key={t.filename} value={t.filename}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  )
}

function PromptField({
  scriptChoice,
  prompt,
  onChange,
}: {
  scriptChoice: ScriptChoice
  prompt: string
  onChange: (v: string) => void
}) {
  const hasPreset =
    !!prompt &&
    scriptChoice !== 'ralph' &&
    scriptChoice !== 'ralph-pr' &&
    scriptChoice !== 'ralph-issues'
  return (
    <div className="ralph-form-field">
      <label htmlFor="ralph-prompt">
        Prompt {hasPreset && <span className="ralph-form-hint">(pre-filled from script)</span>}
      </label>
      <textarea
        id="ralph-prompt"
        value={prompt}
        onChange={e => onChange(e.target.value)}
        placeholder={
          scriptChoice === 'ralph'
            ? 'Enter a prompt for the loop (required for ralph core)'
            : scriptChoice === 'ralph-issues'
              ? 'Scan instructions (e.g. "Find security vulnerabilities")'
              : 'Prompt will be auto-filled from script, or enter a custom one'
        }
        rows={5}
      />
    </div>
  )
}

export function RalphLaunchForm({
  initialScript,
  initialPR,
  initialIssue,
  onLaunch,
}: RalphLaunchFormProps) {
  const { data: models } = useRalphModels()
  const { data: agents } = useRalphAgents()
  const { data: providers } = useRalphProviders()

  const [repoPath, setRepoPath] = useState(() => safeGetItem('ralph-last-repo') ?? '')
  const [scriptChoice, setScriptChoice] = useState<ScriptChoice>(initialScript ?? 'ralph')

  // Sync when sidebar changes the selected script
  useEffect(() => {
    if (initialScript) setScriptChoice(initialScript)
  }, [initialScript])

  // Pre-populate from PR detail context menu
  useEffect(() => {
    if (initialPR) {
      setScriptChoice('ralph-pr')
      setPrNumber(String(initialPR.prNumber))
      if (initialPR.repoPath) setRepoPath(initialPR.repoPath)
    }
  }, [initialPR])

  // Pre-populate from Issue detail "Start Ralph Loop" action
  useEffect(() => {
    if (initialIssue) {
      setScriptChoice('ralph')
      if (initialIssue.repoPath) setRepoPath(initialIssue.repoPath)
      setIssueNumber(String(initialIssue.issueNumber))
      setBranch(`fix/issue-${initialIssue.issueNumber}`)
      const issuePrompt = [
        `Fix GitHub Issue #${initialIssue.issueNumber}: ${initialIssue.issueTitle}`,
        '',
        initialIssue.issueBody || '(no description provided)',
        '',
        'Implement the fix, run tests, commit, and push.',
      ].join('\n')
      setPrompt(issuePrompt)
    }
  }, [initialIssue])
  const [model, setModel] = useState('claude-opus-4.6')
  const [provider, setProvider] = useState('')
  const [devAgent, setDevAgent] = useState('anvil')
  const [reviewAgents, setReviewAgents] = useState<string[]>([])
  const [reviewerModels, setReviewerModels] = useState<Record<string, string>>({})
  const [iterations, setIterations] = useState(3)
  const [repeats, setRepeats] = useState(1)
  const [branch, setBranch] = useState('')
  const [prompt, setPrompt] = useState('')
  const [prNumber, setPrNumber] = useState('')
  const [issueNumber, setIssueNumber] = useState('')
  const [labels, setLabels] = useState('')
  const [dryRun, setDryRun] = useState(false)
  const [autoApprove, setAutoApprove] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<RalphTemplateInfo[]>([])

  useEffect(() => {
    window.ralph
      .listTemplates()
      .then(setTemplates)
      .catch(() => {})
  }, [])

  // Auto-populate prompt from the script's embedded default prompt
  useEffect(() => {
    const key = scriptChoice.replace(/\.ps1$/, '')
    const template = templates.find(t => t.filename.replace(/\.ps1$/, '') === key)
    setPrompt(template?.defaultPrompt ?? '')
  }, [scriptChoice, templates])

  // Reset model when provider changes and current model is incompatible
  useEffect(() => {
    if (!model || !provider || !providers || !models) return
    const supported = providers.providers[provider]?.supportedModelProviders
    if (!supported) return
    const resolvedKey = models.aliases[model] ?? model
    const entry = models.models[resolvedKey]
    if (entry && !supported.includes(entry.provider)) setModel('')
  }, [provider, providers, models, model])

  const modelOptions = useMemo(() => {
    if (!models) return []
    const supported = provider
      ? providers?.providers?.[provider]?.supportedModelProviders
      : undefined
    const filteredModels = Object.entries(models.models)
      .filter(([, m]) => !supported || supported.includes(m.provider))
      .map(([key, m]) => ({
        value: key,
        label: `${m.label} (${m.reasoningEffort})`,
      }))
    const filteredAliases = Object.entries(models.aliases)
      .filter(([, target]) => {
        const targetModel = models.models[target]
        return !supported || (targetModel && supported.includes(targetModel.provider))
      })
      .map(([alias, target]) => ({
        value: alias,
        label: `${alias} → ${target}`,
      }))
    return [...filteredModels, ...filteredAliases]
  }, [models, provider, providers])

  // Per-reviewer options: Account: Model list across ALL providers (not filtered by main)
  const reviewerModelOptions = useMemo(() => {
    if (!models || !providers) return []
    return Object.entries(providers.providers)
      .map(([key, prov]) => buildProviderModelGroup(key, prov, models))
      .filter((g): g is ReviewerModelGroup => g !== null)
  }, [models, providers])

  const providerOptions = useMemo(() => {
    if (!providers) return []
    return Object.entries(providers.providers).map(([key, p]) => ({
      value: key,
      label: `${key} — ${p.description}`,
    }))
  }, [providers])

  const devAgentOptions = useMemo(() => {
    if (!agents) return []
    return Object.entries(agents.roles)
      .filter(([, role]) => role.category === 'dev')
      .map(([key, role]) => ({ value: key, label: `${key} — ${role.description}` }))
  }, [agents])

  const reviewAgentOptions = useMemo(() => {
    if (!agents) return []
    return Object.entries(agents.roles)
      .filter(([, role]) => role.category === 'review')
      .map(([key, role]) => ({ value: key, label: `${key} — ${role.description}` }))
  }, [agents])

  const toggleReviewAgent = (key: string) => {
    setReviewAgents(prev => {
      if (prev.includes(key)) {
        setReviewerModels(rm => {
          const next = { ...rm }
          delete next[key]
          return next
        })
        return prev.filter(a => a !== key)
      }
      return [...prev, key]
    })
  }

  const setReviewerModel = (role: string, m: string) => {
    setReviewerModels(prev => ({ ...prev, [role]: m }))
  }

  const handleBrowse = async () => {
    try {
      const result = await window.ralph.selectDirectory()
      if (result) {
        setRepoPath(result)
        safeSetItem('ralph-last-repo', result)
      }
    } catch (_: unknown) {
      // user cancelled
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repoPath) {
      setError('Select a repository path')
      return
    }
    if (scriptChoice === 'ralph-pr' && !prNumber) {
      setError('PR number is required for ralph-pr')
      return
    }

    setLaunching(true)
    setError(null)
    safeSetItem('ralph-last-repo', repoPath)

    const config = buildLaunchConfig({
      repoPath,
      scriptChoice,
      model,
      provider,
      devAgent,
      reviewAgents,
      reviewerModels,
      iterations,
      repeats,
      branch,
      prompt,
      prNumber,
      issueNumber,
      labels,
      dryRun,
      autoApprove,
    })
    const result = await onLaunch?.(config)
    if (result && !result.success) {
      setError(result.error ?? 'Launch failed')
    }
    setLaunching(false)
  }

  return (
    <form className="ralph-launch-form" onSubmit={handleSubmit}>
      <h3 className="ralph-form-title">Launch Loop</h3>

      {error && <div className="ralph-form-error">{error}</div>}

      <div className="ralph-form-field">
        <label htmlFor="ralph-repo">Repository</label>
        <div className="ralph-input-row">
          <input
            id="ralph-repo"
            type="text"
            value={repoPath}
            onChange={e => setRepoPath(e.target.value)}
            placeholder="D:\github\org\repo"
          />
          <button type="button" className="ralph-browse-btn" onClick={handleBrowse}>
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      <ScriptSelect value={scriptChoice} onChange={setScriptChoice} templates={templates} />

      <ScriptSpecificFields
        scriptChoice={scriptChoice}
        prNumber={prNumber}
        onPrNumberChange={setPrNumber}
        labels={labels}
        onLabelsChange={setLabels}
        dryRun={dryRun}
        onDryRunChange={setDryRun}
      />

      <IterationsRow
        scriptChoice={scriptChoice}
        iterations={iterations}
        onIterationsChange={setIterations}
        repeats={repeats}
        onRepeatsChange={setRepeats}
      />

      <ModelProviderRow
        model={model}
        onModelChange={setModel}
        provider={provider}
        onProviderChange={setProvider}
        modelOptions={modelOptions}
        providerOptions={providerOptions}
        defaultModel={models?.default}
        defaultProvider={providers?.default}
      />

      <div className="ralph-form-row">
        <div className="ralph-form-field">
          <label htmlFor="ralph-dev-agent">Work Agent</label>
          <select id="ralph-dev-agent" value={devAgent} onChange={e => setDevAgent(e.target.value)}>
            <option value="">Default</option>
            {devAgentOptions.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ralph-form-field">
          <label htmlFor="ralph-branch">Branch (optional)</label>
          <input
            id="ralph-branch"
            type="text"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            placeholder="Specify branch to work on, or leave blank to auto-create"
          />
        </div>
      </div>

      <div className="ralph-form-row">
        <label className="ralph-toggle-label">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={e => setAutoApprove(e.target.checked)}
          />
          <span className="ralph-toggle-text">Auto-approve PR when reviews pass</span>
        </label>
      </div>

      {reviewAgentOptions.length > 0 && (
        <div className="ralph-form-field">
          <span className="ralph-form-label">PR Review Agents</span>
          <div className="ralph-agent-chips">
            {reviewAgentOptions.map(o => {
              const isSelected = reviewAgents.includes(o.value)
              return (
                <div key={o.value} className="ralph-agent-chip-wrapper">
                  <button
                    type="button"
                    className={`ralph-agent-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleReviewAgent(o.value)}
                    title={o.label}
                  >
                    {o.value}
                  </button>
                  {isSelected && (
                    <select
                      className="ralph-agent-model-select"
                      value={reviewerModels[o.value] ?? ''}
                      onChange={e => setReviewerModel(o.value, e.target.value)}
                      title={`Model for ${o.value}`}
                    >
                      <option value="">Default model</option>
                      {reviewerModelOptions.map(g => (
                        <optgroup key={g.provider} label={g.label}>
                          {g.options.map(m => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <PromptField scriptChoice={scriptChoice} prompt={prompt} onChange={setPrompt} />

      <button type="submit" className="ralph-launch-btn" disabled={launching || !repoPath}>
        <Play size={14} />
        {launching ? 'Launching…' : 'Launch'}
      </button>
    </form>
  )
}
