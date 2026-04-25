import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ExecConfigSection } from './ExecConfigSection'

function renderSection(overrides: Partial<ComponentProps<typeof ExecConfigSection>> = {}) {
  const props: ComponentProps<typeof ExecConfigSection> = {
    command: '',
    shell: 'powershell',
    timeout: 60000,
    cwd: '',
    onCommandChange: vi.fn(),
    onShellChange: vi.fn(),
    onTimeoutChange: vi.fn(),
    onCwdChange: vi.fn(),
    ...overrides,
  }
  const result = render(<ExecConfigSection {...props} />)
  return { ...result, ...props }
}

describe('ExecConfigSection', () => {
  it('renders all form labels and hints', () => {
    renderSection()

    expect(screen.getByLabelText('Command *')).toBeInTheDocument()
    expect(screen.getByLabelText('Shell')).toBeInTheDocument()
    expect(screen.getByLabelText('Timeout (ms)')).toBeInTheDocument()
    expect(screen.getByLabelText('Working Directory')).toBeInTheDocument()
    expect(screen.getByText('The shell command to execute')).toBeInTheDocument()
    expect(screen.getByText("Leave empty to use the app's working directory")).toBeInTheDocument()
  })

  it('renders the provided command, shell, timeout, and working directory values', () => {
    renderSection({
      command: 'echo hello',
      shell: 'bash',
      timeout: 30000,
      cwd: '/home/user/project',
    })

    expect(screen.getByLabelText('Command *')).toHaveValue('echo hello')
    expect(screen.getByLabelText('Shell')).toHaveValue('bash')
    expect(screen.getByLabelText('Timeout (ms)')).toHaveValue(30000)
    expect(screen.getByLabelText('Working Directory')).toHaveValue('/home/user/project')
  })

  it('renders all supported shell options', () => {
    renderSection()

    const options = screen.getAllByRole('option')

    expect(options).toHaveLength(3)
    expect(options[0]).toHaveValue('powershell')
    expect(options[0]).toHaveTextContent('PowerShell')
    expect(options[1]).toHaveValue('bash')
    expect(options[1]).toHaveTextContent('Bash')
    expect(options[2]).toHaveValue('cmd')
    expect(options[2]).toHaveTextContent('CMD')
  })

  it('calls onCommandChange when the command textarea changes', () => {
    const { onCommandChange } = renderSection()

    fireEvent.change(screen.getByLabelText('Command *'), {
      target: { value: 'ls -la' },
    })

    expect(onCommandChange).toHaveBeenCalledWith('ls -la')
  })

  it('calls onShellChange when the shell select changes', () => {
    const { onShellChange } = renderSection()

    fireEvent.change(screen.getByLabelText('Shell'), {
      target: { value: 'cmd' },
    })

    expect(onShellChange).toHaveBeenCalledWith('cmd')
  })

  it('calls onTimeoutChange with the parsed number when timeout changes', () => {
    const { onTimeoutChange } = renderSection()

    fireEvent.change(screen.getByLabelText('Timeout (ms)'), {
      target: { value: '45000' },
    })

    expect(onTimeoutChange).toHaveBeenCalledWith(45000)
  })

  it('falls back to 60000 when the timeout input is cleared', () => {
    const { onTimeoutChange } = renderSection({ timeout: 60000 })

    fireEvent.change(screen.getByLabelText('Timeout (ms)'), {
      target: { value: '' },
    })

    expect(onTimeoutChange).toHaveBeenCalledWith(60000)
  })

  it('calls onCwdChange when the working directory input changes', () => {
    const { onCwdChange } = renderSection()

    fireEvent.change(screen.getByLabelText('Working Directory'), {
      target: { value: '/tmp/workspace' },
    })

    expect(onCwdChange).toHaveBeenCalledWith('/tmp/workspace')
  })
})
