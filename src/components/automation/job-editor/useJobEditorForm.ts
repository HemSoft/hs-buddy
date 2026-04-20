import { useState, useEffect } from 'react'
import {
  useJob,
  useJobMutations,
  useBuddyStatsMutations,
  type JobId,
} from '../../../hooks/useConvex'
import { useCopilotSettings } from '../../../hooks/useConfig'

export interface JobConfig {
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
  repoOwner?: string
  repoName?: string
  // skill-worker
  skillName?: string
  action?: string
  params?: unknown
}

interface UseJobEditorFormSource {
  name: string
  description?: string
  workerType: 'exec' | 'ai' | 'skill'
  config: JobConfig
}

export function useJobEditorForm(
  jobId: string | undefined,
  duplicateFrom: UseJobEditorFormSource | undefined,
  onSaved: (() => void) | undefined,
  onClose: () => void
) {
  const existingJob = useJob(jobId as JobId | undefined)
  const { create, update } = useJobMutations()
  const { increment: incrementStat } = useBuddyStatsMutations()
  const { ghAccount: defaultGhAccount, model: defaultModel } = useCopilotSettings()

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
  const [ghAccount, setGhAccount] = useState('')
  const [model, setModel] = useState('')
  const [targetRepo, setTargetRepo] = useState('')

  // skill config
  const [skillName, setSkillName] = useState('')
  const [skillAction, setSkillAction] = useState('')
  const [skillParams, setSkillParams] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!jobId

  useEffect(() => {
    if (!isEditing && !duplicateFrom) {
      setGhAccount(defaultGhAccount)
      setModel(defaultModel)
    }
  }, [defaultGhAccount, defaultModel, isEditing, duplicateFrom])

  useEffect(() => {
    const source = existingJob || duplicateFrom
    if (source) {
      setName(duplicateFrom ? `${source.name} (Copy)` : source.name)
      setDescription(source.description || '')
      setWorkerType(source.workerType)
      /* v8 ignore start */
      if (source.config) {
        /* v8 ignore stop */
        if (source.config.command) setCommand(source.config.command)
        if (source.config.cwd) setCwd(source.config.cwd)
        if (source.config.timeout) setTimeout(source.config.timeout)
        if (source.config.shell) setShell(source.config.shell)
        if (source.config.prompt) setPrompt(source.config.prompt)
        if (source.config.model) setModel(source.config.model)
        if (source.config.repoOwner && source.config.repoName) {
          setTargetRepo(`${source.config.repoOwner}/${source.config.repoName}`)
        }
        if (source.config.skillName) setSkillName(source.config.skillName)
        if (source.config.action) setSkillAction(source.config.action)
        if (source.config.params) setSkillParams(JSON.stringify(source.config.params, null, 2))
      }
    }
  }, [existingJob, duplicateFrom])

  const buildConfig = (): JobConfig => {
    /* v8 ignore start */
    switch (workerType) {
      /* v8 ignore stop */
      case 'exec':
        return {
          command: command.trim(),
          cwd: cwd.trim() || undefined,
          /* v8 ignore start */
          timeout: timeout || undefined,
          /* v8 ignore stop */
          shell,
        }
      case 'ai': {
        const [repoOwner, repoName] = targetRepo ? targetRepo.split('/') : [undefined, undefined]
        return {
          prompt: prompt.trim(),
          /* v8 ignore start */
          model: model.trim() || undefined,
          /* v8 ignore stop */
          repoOwner,
          repoName,
        }
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
      default:
        /* v8 ignore start */
        return {}
      /* v8 ignore stop */
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Job name is required')
      return
    }
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
        /* v8 ignore start */
        incrementStat({ field: 'jobsCreated' }).catch(() => {})
        /* v8 ignore stop */
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job')
    } finally {
      setSaving(false)
    }
  }

  return {
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
  }
}
