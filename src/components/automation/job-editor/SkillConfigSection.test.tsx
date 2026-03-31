import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SkillConfigSection } from './SkillConfigSection'

describe('SkillConfigSection', () => {
  const defaultProps = {
    skillName: 'todoist',
    skillAction: 'list',
    skillParams: '{"filter": "today"}',
    onSkillNameChange: vi.fn(),
    onSkillActionChange: vi.fn(),
    onSkillParamsChange: vi.fn(),
  }

  it('renders skill name input', () => {
    render(<SkillConfigSection {...defaultProps} />)
    const input = screen.getByLabelText('Skill Name *') as HTMLInputElement
    expect(input.value).toBe('todoist')
  })

  it('renders action input', () => {
    render(<SkillConfigSection {...defaultProps} />)
    const input = screen.getByLabelText('Action') as HTMLInputElement
    expect(input.value).toBe('list')
  })

  it('renders parameters textarea', () => {
    render(<SkillConfigSection {...defaultProps} />)
    const textarea = screen.getByLabelText('Parameters (JSON)') as HTMLTextAreaElement
    expect(textarea.value).toBe('{"filter": "today"}')
  })

  it('calls onSkillNameChange when skill name changed', () => {
    render(<SkillConfigSection {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('Skill Name *'), { target: { value: 'github' } })
    expect(defaultProps.onSkillNameChange).toHaveBeenCalledWith('github')
  })

  it('calls onSkillActionChange when action changed', () => {
    render(<SkillConfigSection {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'create' } })
    expect(defaultProps.onSkillActionChange).toHaveBeenCalledWith('create')
  })

  it('calls onSkillParamsChange when params changed', () => {
    render(<SkillConfigSection {...defaultProps} />)
    fireEvent.change(screen.getByLabelText('Parameters (JSON)'), { target: { value: '{}' } })
    expect(defaultProps.onSkillParamsChange).toHaveBeenCalledWith('{}')
  })

  it('shows hint text', () => {
    render(<SkillConfigSection {...defaultProps} />)
    expect(screen.getByText('Name of the Claude skill to execute')).toBeTruthy()
    expect(screen.getByText('Specific action within the skill')).toBeTruthy()
  })
})
