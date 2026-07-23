import { useState, useMemo, useEffect, useRef } from 'react'
import { Play, FolderOpen } from 'lucide-react'
import { useRalphModels, useRalphAgents, useRalphProviders } from '../../hooks/useRalphConfig'
import { safeGetItem, safeSetItem } from '../../utils/storage'
import type {
  RalphLaunchConfig,
  RalphLaunchResult,
  RalphModelsConfig,
  RalphProvider,
  RalphProviderEntry,
  RalphProvidersConfig,
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

function isModelIncompatible(
  model: string,
  provider: string,
  providers: RalphProvidersConfig,
  models: RalphModelsConfig
): boolean {
  const supported = providers.providers[provider]?.supportedModelProviders
  if (!supported) return false
  const resolvedKey = models.aliases[model] ?? model
  const entry = models.models[resolvedKey]
  return !!entry && !supported.includes(entry.provider)
}

function getModelOption(
  provKey: string,
  modelKey: string,
  model: RalphModelsConfig['models'][string],
  supportedProviders: Set<string>
): { value: string; label: string } | null {
  if (!supportedProviders.has(model.provider)) return null
  return { value: `${provKey}:${modelKey}`, label: `${model.label} (${model.reasoningEffort})` }
}

function getAliasModelOption(
  provKey: string,
  alias: string,
  target: string,
  models: RalphModelsConfig,
  supportedProviders: Set<string>
): { value: string; label: string } | null {
  const targetModel = models.models[target]
  if (!targetModel || !supportedProviders.has(targetModel.provider)) return null
  return { value: `${provKey}:${alias}`, label: `${alias} → ${target}` }
}

function collectModelOptions(
  provKey: string,
  models: RalphModelsConfig,
  supported: string[]
): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = []
  const supportedProviders = new Set(supported)
  for (const [modelKey, m] of Object.entries(models.models)) {
    const option = getModelOption(provKey, modelKey, m, supportedProviders)
    if (option) opts.push(option)
  }
  for (const [alias, target] of Object.entries(models.aliases)) {
    const option = getAliasModelOption(provKey, alias, target, models, supportedProviders)
    if (option) opts.push(option)
  }
  return opts
}

function buildProviderModelGroup(
  provKey: string,
  prov: RalphProviderEntry,
  models: RalphModelsConfig
): ReviewerModelGroup | null {
  const supported = prov.supportedModelProviders ?? []
  const opts = collectModelOptions(provKey, models, supported)
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
  return !isBuiltInScriptChoice(choice)
    ? { scriptType: 'template', templateScript: choice }
    : { scriptType: choice as RalphLaunchConfig['scriptType'] }
}

function isBuiltInScriptChoice(choice: ScriptChoice): boolean {
  return choice === 'ralph' || choice === 'ralph-pr' || choice === 'ralph-issues'
}

function buildPromptRunFields(opts: LaunchFormValues): Partial<RalphLaunchConfig> {
  const trimmedPrompt = opts.prompt.trim()
  return {
    ...(opts.branch && { branch: opts.branch }),
    ...(trimmedPrompt && { prompt: trimmedPrompt }),
    ...(opts.labels.trim() && { labels: opts.labels.trim() }),
  }
}

function buildControlRunFields(opts: LaunchFormValues): Partial<RalphLaunchConfig> {
  return {
    ...(opts.repeats > 1 && { repeats: opts.repeats }),
    ...(opts.dryRun && { dryRun: true }),
    ...(opts.autoApprove && { autoApprove: true }),
  }
}

function buildRunFields(opts: LaunchFormValues): Partial<RalphLaunchConfig> {
  return {
    ...buildPromptRunFields(opts),
    ...buildControlRunFields(opts),
  }
}

function parsePositiveInteger(value: string): number | undefined {
  const trimmedValue = value.trim()
  if (!trimmedValue) return undefined
  const parsedValue = Number(trimmedValue)
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : undefined
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
  const prNum = parsePositiveInteger(opts.prNumber)
  const issueNum = parsePositiveInteger(opts.issueNumber)
  return {
    repoPath: opts.repoPath,
    ...resolveScriptType(opts.scriptChoice),
    iterations: opts.iterations,
    ...(prNum !== undefined ? { prNumber: prNum } : {}),
    ...(issueNum !== undefined ? { issueNumber: issueNum } : {}),
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
          <span className="ralph-form-hint">required: the existing PR to resolve</span>
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
            <span className="ralph-form-hint">scan only: don&apos;t create issues</span>
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

function hasPresetPrompt(scriptChoice: ScriptChoice, prompt: string): boolean {
  return Boolean(prompt) && !isBuiltInScriptChoice(scriptChoice)
}

function getPromptPlaceholder(scriptChoice: ScriptChoice): string {
  if (scriptChoice === 'ralph') return 'Enter a prompt for the loop (required for ralph core)'
  if (scriptChoice === 'ralph-issues')
    return 'Scan instructions (e.g. "Find security vulnerabilities")'
  return 'Prompt will be auto-filled from script, or enter a custom one'
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
  const hasPreset = hasPresetPrompt(scriptChoice, prompt)
  return (
    <div className="ralph-form-field">
      <label htmlFor="ralph-prompt">
        Prompt {hasPreset && <span className="ralph-form-hint">(pre-filled from script)</span>}
      </label>
      <textarea
        id="ralph-prompt"
        value={prompt}
        onChange={e => onChange(e.target.value)}
        placeholder={getPromptPlaceholder(scriptChoice)}
        rows={5}
      />
    </div>
  )
}

interface ReviewAgentsSectionProps {
  options: { value: string; label: string }[]
  selected: string[]
  reviewerModels: Record<string, string>
  reviewerModelOptions: ReviewerModelGroup[]
  onToggle: (key: string) => void
  onModelChange: (role: string, model: string) => void
}

function ReviewAgentsSection({
  options,
  selected,
  reviewerModels,
  reviewerModelOptions,
  onToggle,
  onModelChange,
}: ReviewAgentsSectionProps) {
  if (options.length === 0) return null
  return (
    <div className="ralph-form-field">
      <span className="ralph-form-label">PR Review Agents</span>
      <div className="ralph-agent-chips">
        {options.map(o => {
          const isSelected = selected.includes(o.value)
          return (
            <div key={o.value} className="ralph-agent-chip-wrapper">
              <button
                type="button"
                className={`ralph-agent-chip ${isSelected ? 'selected' : ''}`}
                onClick={() => onToggle(o.value)}
                title={o.label}
              >
                {o.value}
              </button>
              {isSelected && (
                <select
                  className="ralph-agent-model-select"
                  value={reviewerModels[o.value] ?? ''}
                  onChange={e => onModelChange(o.value, e.target.value)}
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
  )
}

function LaunchButton({ launching, canSubmit }: { launching: boolean; canSubmit: boolean }) {
  return (
    <button type="submit" className="ralph-launch-btn" disabled={!canSubmit}>
      <Play size={14} />
      {launching ? 'Launching…' : 'Launch'}
    </button>
  )
}

function getConfigDefaults(
  models: RalphModelsConfig | null | undefined,
  providers: RalphProvidersConfig | null | undefined
) {
  return { defaultModel: models?.default, defaultProvider: providers?.default }
}

function findTemplatePrompt(
  scriptChoice: ScriptChoice,
  templates: RalphTemplateInfo[]
): string | null {
  if (isBuiltInScriptChoice(scriptChoice)) return null
  const key = scriptChoice.replace(/\.ps1$/, '')
  const template = templates.find(t => t.filename.replace(/\.ps1$/, '') === key)
  return template?.defaultPrompt ?? null
}

function canValidateModelCompatibility(deps: {
  model: string
  provider: string
  providers: RalphProvidersConfig | null | undefined
  models: RalphModelsConfig | null | undefined
}): deps is {
  model: string
  provider: string
  providers: RalphProvidersConfig
  models: RalphModelsConfig
} {
  return Boolean(deps.model && deps.provider && deps.providers && deps.models)
}

function getProviderMap(
  providers: RalphProvidersConfig | null | undefined
): RalphProvidersConfig['providers'] | null {
  return providers?.providers ?? null
}

function toSupportedProviderSet(supported: string[] | undefined): Set<string> | null {
  if (!supported) return null
  return new Set(supported)
}

function getSupportedProviderSet(
  provider: string,
  providers: RalphProvidersConfig | null | undefined
): Set<string> | null {
  if (!provider) return null
  const providerMap = getProviderMap(providers)
  if (!providerMap) return null
  const entry = providerMap[provider]
  if (!entry) return null
  return toSupportedProviderSet(entry.supportedModelProviders)
}

function getModelSelectOption(
  key: string,
  model: RalphModelsConfig['models'][string],
  supportedProviders: Set<string> | null
) {
  if (supportedProviders && !supportedProviders.has(model.provider)) return null
  return { value: key, label: `${model.label} (${model.reasoningEffort})` }
}

function getAliasSelectOption(
  alias: string,
  target: string,
  models: RalphModelsConfig,
  supportedProviders: Set<string> | null
) {
  const targetModel = models.models[target]
  if (!targetModel) return null
  if (supportedProviders && !supportedProviders.has(targetModel.provider)) return null
  return { value: alias, label: `${alias} → ${target}` }
}

function buildModelSelectOptions(
  models: RalphModelsConfig,
  providers: RalphProvidersConfig | null | undefined,
  provider: string
) {
  const supportedProviders = getSupportedProviderSet(provider, providers)
  const modelOptions = Object.entries(models.models).flatMap(([key, model]) => {
    const option = getModelSelectOption(key, model, supportedProviders)
    return option ? [option] : []
  })
  const aliasOptions = Object.entries(models.aliases).flatMap(([alias, target]) => {
    const option = getAliasSelectOption(alias, target, models, supportedProviders)
    return option ? [option] : []
  })
  return [...modelOptions, ...aliasOptions]
}

function buildAgentOptions(
  agents: ReturnType<typeof useRalphAgents>['data'],
  category: 'dev' | 'review'
) {
  if (!agents) return []
  return Object.entries(agents.roles).flatMap(([key, role]) =>
    role.category === category ? [{ value: key, label: `${key} — ${role.description}` }] : []
  )
}

function applyLaunchResult(
  result: RalphLaunchResult | undefined,
  setError: (value: string | null) => void
): void {
  if (!result || result.success) return
  setError(result.error ?? 'Launch failed')
}

function useRalphFormSync(
  initialScript: RalphLaunchFormProps['initialScript'],
  initialPR: RalphLaunchFormProps['initialPR'],
  initialIssue: RalphLaunchFormProps['initialIssue'],
  setters: {
    setScriptChoice: (v: ScriptChoice) => void
    setPrNumber: (v: string) => void
    setRepoPath: (v: string) => void
    setIssueNumber: (v: string) => void
    setBranch: (v: string) => void
    setPrompt: (v: string) => void
    setModel: (v: string) => void
  },
  deps: {
    scriptChoice: ScriptChoice
    model: string
    provider: string
    providers: RalphProvidersConfig | null | undefined
    models: RalphModelsConfig | null | undefined
  }
) {
  const [templates, setTemplates] = useState<RalphTemplateInfo[]>([])
  const {
    setScriptChoice,
    setPrNumber,
    setRepoPath,
    setIssueNumber,
    setBranch,
    setPrompt,
    setModel,
  } = setters
  const { scriptChoice, model, provider, providers, models } = deps

  useEffect(() => {
    if (initialScript) setScriptChoice(initialScript)
  }, [initialScript, setScriptChoice])

  useEffect(() => {
    if (initialPR) {
      setScriptChoice('ralph-pr')
      setPrNumber(String(initialPR.prNumber))
      if (initialPR.repoPath) setRepoPath(initialPR.repoPath)
    }
  }, [initialPR, setScriptChoice, setPrNumber, setRepoPath])

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
  }, [initialIssue, setScriptChoice, setRepoPath, setIssueNumber, setBranch, setPrompt])

  useEffect(() => {
    window.ralph
      .listTemplates()
      .then(setTemplates)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const defaultPrompt = findTemplatePrompt(scriptChoice, templates)
    if (defaultPrompt != null) setPrompt(defaultPrompt)
  }, [scriptChoice, templates, setPrompt])

  useEffect(() => {
    const validationDeps = { model, provider, providers, models }
    if (!canValidateModelCompatibility(validationDeps)) return
    if (isModelIncompatible(model, provider, validationDeps.providers, validationDeps.models))
      setModel('')
  }, [provider, providers, models, model, setModel])

  return { templates }
}

function useRalphFormOptions(
  models: RalphModelsConfig | null | undefined,
  providers: RalphProvidersConfig | null | undefined,
  agents: ReturnType<typeof useRalphAgents>['data'],
  provider: string
) {
  const modelOptions = useMemo(() => {
    if (!models) return []
    return buildModelSelectOptions(models, providers, provider)
  }, [models, provider, providers])

  const reviewerModelOptions = useMemo(() => {
    if (!models || !providers) return []
    return Object.entries(providers.providers).flatMap(([key, prov]) => {
      const group = buildProviderModelGroup(key, prov, models)
      return group ? [group] : []
    })
  }, [models, providers])

  const providerOptions = useMemo(() => {
    if (!providers) return []
    return Object.entries(providers.providers).map(([key, p]) => ({
      value: key,
      label: `${key} — ${p.description}`,
    }))
  }, [providers])

  const devAgentOptions = useMemo(() => {
    return buildAgentOptions(agents, 'dev')
  }, [agents])

  const reviewAgentOptions = useMemo(() => {
    return buildAgentOptions(agents, 'review')
  }, [agents])

  return {
    modelOptions,
    reviewerModelOptions,
    providerOptions,
    devAgentOptions,
    reviewAgentOptions,
  }
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

  const effectiveScript: ScriptChoice = initialScript ?? 'ralph'
  const [repoPath, setRepoPath] = useState(() => safeGetItem('ralph-last-repo') ?? '')
  const [scriptChoice, setScriptChoice] = useState<ScriptChoice>(effectiveScript)
  const [model, setModel] = useState('claude-opus-4.6')
  const [provider, setProvider] = useState('')
  const [devAgent, setDevAgent] = useState('anvil')
  const [reviewAgents, setReviewAgents] = useState<string[]>([])
  const reviewAgentsRef = useRef(reviewAgents)
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

  const { templates } = useRalphFormSync(
    initialScript,
    initialPR,
    initialIssue,
    {
      setScriptChoice,
      setPrNumber,
      setRepoPath,
      setIssueNumber,
      setBranch,
      setPrompt,
      setModel,
    },
    { scriptChoice, model, provider, providers, models }
  )

  const {
    modelOptions,
    reviewerModelOptions,
    providerOptions,
    devAgentOptions,
    reviewAgentOptions,
  } = useRalphFormOptions(models, providers, agents, provider)

  const toggleReviewAgent = (key: string) => {
    const current = reviewAgentsRef.current
    const isSelected = current.includes(key)
    const next = isSelected ? current.filter(a => a !== key) : [...current, key]
    reviewAgentsRef.current = next
    if (isSelected) {
      setReviewerModels(rm => {
        const remaining = { ...rm }
        delete remaining[key]
        return remaining
      })
    }
    setReviewAgents(next)
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

  const validateForm = (): string | null => {
    if (!repoPath) return 'Select a repository path'
    if (scriptChoice === 'ralph-pr' && parsePositiveInteger(prNumber) === undefined) {
      return 'PR number is required for ralph-pr'
    }
    if (issueNumber && parsePositiveInteger(issueNumber) === undefined) {
      return 'Issue number must be a positive integer'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
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
    try {
      const result = await onLaunch?.(config)
      applyLaunchResult(result, setError)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to launch Ralph run')
    } finally {
      setLaunching(false)
    }
  }

  const { defaultModel, defaultProvider } = getConfigDefaults(models, providers)
  const canSubmit = !launching && Boolean(repoPath)

  return (
    <form className="ralph-launch-form" onSubmit={handleSubmit}>
      <h3 className="ralph-form-title">Launch Loop</h3>

      {error ? <div className="ralph-form-error">{error}</div> : null}

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
          <button
            type="button"
            className="ralph-browse-btn"
            onClick={handleBrowse}
            aria-label="Browse for folder"
          >
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
        defaultModel={defaultModel}
        defaultProvider={defaultProvider}
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

      <ReviewAgentsSection
        options={reviewAgentOptions}
        selected={reviewAgents}
        reviewerModels={reviewerModels}
        reviewerModelOptions={reviewerModelOptions}
        onToggle={toggleReviewAgent}
        onModelChange={setReviewerModel}
      />

      <PromptField scriptChoice={scriptChoice} prompt={prompt} onChange={setPrompt} />

      <LaunchButton launching={launching} canSubmit={canSubmit} />
    </form>
  )
}
