import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { JobEditor } from './JobEditor'

type MockJobEditorForm = {
  name: string
  setName: ReturnType<typeof vi.fn>
  description: string
  setDescription: ReturnType<typeof vi.fn>
  workerType: 'exec' | 'ai' | 'skill'
  setWorkerType: ReturnType<typeof vi.fn>
  command: string
  setCommand: ReturnType<typeof vi.fn>
  cwd: string
  setCwd: ReturnType<typeof vi.fn>
  timeout: number
  setTimeout: ReturnType<typeof vi.fn>
  shell: 'powershell' | 'bash' | 'cmd'
  setShell: ReturnType<typeof vi.fn>
  prompt: string
  setPrompt: ReturnType<typeof vi.fn>
  ghAccount: string
  setGhAccount: ReturnType<typeof vi.fn>
  model: string
  setModel: ReturnType<typeof vi.fn>
  targetRepo: string
  setTargetRepo: ReturnType<typeof vi.fn>
  skillName: string
  setSkillName: ReturnType<typeof vi.fn>
  skillAction: string
  setSkillAction: ReturnType<typeof vi.fn>
  skillParams: string
  setSkillParams: ReturnType<typeof vi.fn>
  saving: boolean
  error: string | null
  isEditing: boolean
  handleSave: ReturnType<typeof vi.fn>
}

let mockForm: MockJobEditorForm

vi.mock('./job-editor/useJobEditorForm', () => ({
  useJobEditorForm: () => mockForm,
}))

vi.mock('./job-editor/ExecConfigSection', () => ({
  ExecConfigSection: ({ command }: { command: string }) => (
    <div data-testid="exec-config">Exec config: {command || 'empty'}</div>
  ),
}))

vi.mock('./job-editor/AiConfigSection', () => ({
  AiConfigSection: ({ prompt }: { prompt: string }) => (
    <div data-testid="ai-config">AI config: {prompt || 'empty'}</div>
  ),
}))

vi.mock('./job-editor/SkillConfigSection', () => ({
  SkillConfigSection: ({ skillName }: { skillName: string }) => (
    <div data-testid="skill-config">Skill config: {skillName || 'empty'}</div>
  ),
}))

function createMockForm(overrides: Partial<MockJobEditorForm> = {}): MockJobEditorForm {
  return {
    ...createMockFormBase(),
    ...overrides,
  }
}

function createMockFormBase(): MockJobEditorForm {
  return {
    name: 'Nightly Automation',
    setName: vi.fn(),
    description: 'Runs every night',
    setDescription: vi.fn(),
    workerType: 'exec',
    setWorkerType: vi.fn(),
    command: 'npm test',
    setCommand: vi.fn(),
    cwd: '/repo',
    setCwd: vi.fn(),
    timeout: 60000,
    setTimeout: vi.fn(),
    shell: 'bash' as const,
    setShell: vi.fn(),
    prompt: 'Review this PR',
    setPrompt: vi.fn(),
    ghAccount: 'buddy',
    setGhAccount: vi.fn(),
    model: 'gpt-5',
    setModel: vi.fn(),
    targetRepo: 'relias-engineering/hs-buddy',
    setTargetRepo: vi.fn(),
    skillName: 'github',
    setSkillName: vi.fn(),
    skillAction: 'review',
    setSkillAction: vi.fn(),
    skillParams: '{"draft":true}',
    setSkillParams: vi.fn(),
    saving: false,
    error: null as string | null,
    isEditing: false,
    handleSave: vi.fn(),
  }
}

function renderEditor(overrides: Partial<ComponentProps<typeof JobEditor>> = {}) {
  const onClose = overrides.onClose ?? vi.fn()
  const onSaved = overrides.onSaved ?? vi.fn()

  render(
    <JobEditor
      jobId={overrides.jobId}
      duplicateFrom={overrides.duplicateFrom}
      onClose={onClose}
      onSaved={onSaved}
    />
  )

  return { onClose, onSaved }
}

describe('JobEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockForm = createMockForm()
  })

  it('renders create mode and wires the base form actions', () => {
    const { onClose } = renderEditor()

    expect(screen.getByRole('heading', { name: 'Create Job' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Nightly Automation')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Runs every night')).toBeInTheDocument()
    expect(screen.getByTestId('exec-config')).toHaveTextContent('npm test')

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Morning Run' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Fresh description' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'AI LLM prompts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))
    fireEvent.click(screen.getByTitle('Close'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockForm.setName).toHaveBeenCalledWith('Morning Run')
    expect(mockForm.setDescription).toHaveBeenCalledWith('Fresh description')
    expect(mockForm.setWorkerType).toHaveBeenCalledWith('ai')
    expect(mockForm.handleSave).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders the matching config section for AI and skill jobs', () => {
    mockForm = createMockForm({ workerType: 'ai' })
    renderEditor()
    expect(screen.getByTestId('ai-config')).toHaveTextContent('Review this PR')

    mockForm = createMockForm({ workerType: 'skill' })
    renderEditor({ onClose: vi.fn() })
    expect(screen.getByTestId('skill-config')).toHaveTextContent('github')
  })

  it('renders edit and duplicate states with editing safeguards and errors', () => {
    mockForm = createMockForm({
      isEditing: true,
      workerType: 'skill',
      saving: true,
      error: 'Job save failed',
    })

    renderEditor({
      jobId: 'job-1',
      duplicateFrom: {
        name: 'Existing Job',
        description: 'Original',
        workerType: 'skill',
        config: { skillName: 'github', action: 'review' },
      },
    })

    expect(screen.getByRole('heading', { name: 'Edit Job' })).toBeInTheDocument()
    expect(screen.getByText('Job save failed')).toBeInTheDocument()
    expect(screen.getByText('Worker type cannot be changed after creation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exec Shell commands' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'AI LLM prompts' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Skill Claude skills' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  })
})
