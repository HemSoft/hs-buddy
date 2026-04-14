import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockCreate = vi.fn().mockResolvedValue(undefined)
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockIncrementStat = vi.fn().mockResolvedValue(undefined)
let mockJobReturn: unknown = undefined

vi.mock('../../../hooks/useConvex', () => ({
  useJob: () => mockJobReturn,
  useJobMutations: () => ({ create: mockCreate, update: mockUpdate }),
  useBuddyStatsMutations: () => ({ increment: mockIncrementStat }),
}))

vi.mock('../../../hooks/useConfig', () => ({
  useCopilotSettings: () => ({ ghAccount: 'alice', model: 'claude-sonnet-4.5' }),
}))

import { useJobEditorForm } from './useJobEditorForm'

describe('useJobEditorForm', () => {
  const mockOnSaved = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockJobReturn = undefined
  })

  it('initializes with empty defaults for new job', () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    expect(result.current.name).toBe('')
    expect(result.current.description).toBe('')
    expect(result.current.workerType).toBe('exec')
    expect(result.current.command).toBe('')
    expect(result.current.isEditing).toBe(false)
    expect(result.current.saving).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets default ghAccount and model from copilot settings', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    await waitFor(() => {
      expect(result.current.ghAccount).toBe('alice')
      expect(result.current.model).toBe('claude-sonnet-4.5')
    })
  })

  it('populates form from duplicate source', () => {
    const source = {
      name: 'My Job',
      description: 'desc',
      workerType: 'ai' as const,
      config: {
        prompt: 'do things',
        model: 'gpt-4',
        repoOwner: 'acme',
        repoName: 'repo',
      },
    }

    const { result } = renderHook(() =>
      useJobEditorForm(undefined, source, mockOnSaved, mockOnClose)
    )

    expect(result.current.name).toBe('My Job (Copy)')
    expect(result.current.description).toBe('desc')
    expect(result.current.workerType).toBe('ai')
    expect(result.current.prompt).toBe('do things')
    expect(result.current.model).toBe('gpt-4')
    expect(result.current.targetRepo).toBe('acme/repo')
  })

  it('allows setting form fields', () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('Test Job')
      result.current.setDescription('A test')
      result.current.setWorkerType('ai')
      result.current.setCommand('echo hello')
      result.current.setCwd('/tmp')
      result.current.setTimeout(30000)
      result.current.setShell('bash')
      result.current.setPrompt('do review')
      result.current.setGhAccount('bob')
      result.current.setModel('gpt-5')
      result.current.setTargetRepo('org/repo')
      result.current.setSkillName('deploy')
      result.current.setSkillAction('run')
      result.current.setSkillParams('{}')
    })

    expect(result.current.name).toBe('Test Job')
    expect(result.current.description).toBe('A test')
    expect(result.current.workerType).toBe('ai')
    expect(result.current.command).toBe('echo hello')
    expect(result.current.cwd).toBe('/tmp')
    expect(result.current.timeout).toBe(30000)
    expect(result.current.shell).toBe('bash')
    expect(result.current.prompt).toBe('do review')
    expect(result.current.ghAccount).toBe('bob')
    expect(result.current.model).toBe('gpt-5')
    expect(result.current.targetRepo).toBe('org/repo')
    expect(result.current.skillName).toBe('deploy')
    expect(result.current.skillAction).toBe('run')
    expect(result.current.skillParams).toBe('{}')
  })

  it('handleSave validates name is required', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('Job name is required')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('handleSave validates command for exec jobs', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('My Job')
      result.current.setWorkerType('exec')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('Command is required for exec jobs')
  })

  it('handleSave validates prompt for AI jobs', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('My Job')
      result.current.setWorkerType('ai')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('Prompt is required for AI jobs')
  })

  it('handleSave validates skillName for skill jobs', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('My Job')
      result.current.setWorkerType('skill')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('Skill name is required for skill jobs')
  })

  it('handleSave creates new exec job successfully', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('Build Job')
      result.current.setCommand('npm run build')
      result.current.setCwd('/app')
      result.current.setShell('bash')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Build Job',
      description: undefined,
      workerType: 'exec',
      config: {
        command: 'npm run build',
        cwd: '/app',
        timeout: 60000,
        shell: 'bash',
      },
    })
    expect(mockOnSaved).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
    expect(mockIncrementStat).toHaveBeenCalledWith({ field: 'jobsCreated' })
  })

  it('handleSave creates new AI job with repo', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('Review Job')
      result.current.setWorkerType('ai')
      result.current.setPrompt('do review')
      result.current.setModel('gpt-4')
      result.current.setTargetRepo('org/repo')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Review Job',
      description: undefined,
      workerType: 'ai',
      config: {
        prompt: 'do review',
        model: 'gpt-4',
        repoOwner: 'org',
        repoName: 'repo',
      },
    })
  })

  it('handleSave creates skill job with parsed params', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('Deploy Job')
      result.current.setWorkerType('skill')
      result.current.setSkillName('deploy')
      result.current.setSkillAction('run')
      result.current.setSkillParams('{"env": "prod"}')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Deploy Job',
      description: undefined,
      workerType: 'skill',
      config: {
        skillName: 'deploy',
        action: 'run',
        params: { env: 'prod' },
      },
    })
  })

  it('handleSave reports error for invalid skill params JSON', async () => {
    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('Deploy Job')
      result.current.setWorkerType('skill')
      result.current.setSkillName('deploy')
      result.current.setSkillParams('not-json')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('Invalid JSON in parameters')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('handleSave updates existing job when editing', async () => {
    mockJobReturn = {
      name: 'Existing',
      description: 'old desc',
      workerType: 'exec',
      config: { command: 'old cmd', shell: 'powershell' },
    }

    const { result } = renderHook(() =>
      useJobEditorForm('job-123', undefined, mockOnSaved, mockOnClose)
    )

    expect(result.current.isEditing).toBe(true)

    act(() => {
      result.current.setCommand('new cmd')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-123',
        name: 'Existing',
        workerType: 'exec',
      })
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('handleSave handles save error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB error'))

    const { result } = renderHook(() =>
      useJobEditorForm(undefined, undefined, mockOnSaved, mockOnClose)
    )

    act(() => {
      result.current.setName('Job')
      result.current.setCommand('cmd')
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('DB error')
    expect(result.current.saving).toBe(false)
    expect(mockOnSaved).not.toHaveBeenCalled()
  })
})
