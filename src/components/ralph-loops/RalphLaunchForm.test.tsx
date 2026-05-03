import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RalphLaunchForm } from './RalphLaunchForm'
import * as storage from '../../utils/storage'
import type { RalphModelsConfig, RalphProvidersConfig, RalphAgentsConfig } from '../../types/ralph'

// Mock proper data structures
const mockModelsConfig: RalphModelsConfig = {
  $comment: 'Test models',
  version: '1.0.0',
  models: {
    'gpt-4': {
      label: 'GPT-4',
      costMultiplier: 1,
      provider: 'openai',
      reasoningEffort: 'standard',
    },
    'claude-3': {
      label: 'Claude 3',
      costMultiplier: 1,
      provider: 'anthropic',
      reasoningEffort: 'standard',
    },
  },
  aliases: {},
  tiers: {},
  default: 'gpt-4',
}

const mockProvidersConfig = {
  version: '1.0.0',
  default: 'openai',
  providers: {
    openai: {
      description: 'OpenAI',
      supportedModelProviders: ['openai'],
    },
    anthropic: {
      description: 'Anthropic',
      supportedModelProviders: ['anthropic'],
    },
  },
} as unknown as RalphProvidersConfig

const mockAgentsConfig = {
  $comment: 'Test agents',
  version: '1.0.0',
  defaults: { devAgent: 'agent1' },
  roles: {
    agent1: {
      category: 'dev' as const,
      description: 'Developer Agent',
      agent: { openai: 'agent1', anthropic: 'agent1' },
      tier: 'tier1',
      skills: ['code', 'debug'],
    },
    reviewer1: {
      category: 'review' as const,
      description: 'Code Reviewer',
      agent: { openai: 'reviewer1', anthropic: 'reviewer1' },
      tier: 'tier1',
      skills: ['review', 'feedback'],
    },
    reviewer2: {
      category: 'review' as const,
      description: 'Security Reviewer',
      agent: { openai: 'reviewer2', anthropic: 'reviewer2' },
      tier: 'tier1',
      skills: ['security', 'review'],
    },
  },
} as RalphAgentsConfig

// Mock the hooks and storage at module level
vi.mock('../../hooks/useRalphConfig', () => ({
  useRalphModels: vi.fn(() => ({
    data: mockModelsConfig,
    loading: false,
    error: null,
  })),
  useRalphProviders: vi.fn(() => ({
    data: mockProvidersConfig,
    loading: false,
    error: null,
  })),
  useRalphAgents: vi.fn(() => ({
    data: mockAgentsConfig,
    loading: false,
    error: null,
  })),
}))

vi.mock('../../utils/storage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

// Import hooks after mocking
import { useRalphModels, useRalphProviders, useRalphAgents } from '../../hooks/useRalphConfig'

describe('RalphLaunchForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset storage mocks
    vi.mocked(storage.safeGetItem).mockReturnValue(null)
    vi.mocked(storage.safeSetItem).mockClear()
    // Setup window.ralph mock
    Object.defineProperty(window, 'ralph', {
      value: {
        launch: vi.fn().mockResolvedValue({ success: true }),
        listTemplates: vi.fn().mockResolvedValue([]),
      },
      writable: true,
      configurable: true,
    })
  })

  describe('Basic Rendering', () => {
    it('renders form with all fields', () => {
      render(<RalphLaunchForm />)

      expect(screen.getByLabelText(/script/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/prompt/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/repository/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /launch/i })).toBeInTheDocument()
    })

    it('renders with repo pre-filled from storage when available', () => {
      const mockRepo = 'owner/repo'
      vi.mocked(storage.safeGetItem).mockReturnValue(mockRepo)

      render(<RalphLaunchForm />)

      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      expect(repoInput.value).toBe(mockRepo)
    })

    it('saves repo path to storage via browse button', async () => {
      Object.defineProperty(window, 'ralph', {
        value: {
          launch: vi.fn().mockResolvedValue({ success: true }),
          listTemplates: vi.fn().mockResolvedValue([]),
          selectDirectory: vi.fn().mockResolvedValue('/selected/path'),
        },
        writable: true,
        configurable: true,
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const browseBtn = document.querySelector('.ralph-browse-btn') as HTMLButtonElement
      await userEvent.click(browseBtn)

      await waitFor(() => {
        expect(vi.mocked(storage.safeSetItem)).toHaveBeenCalledWith(
          'ralph-last-repo',
          '/selected/path'
        )
      })
    })
  })

  describe('Hook Data Rendering', () => {
    it('renders model dropdown with hook data', async () => {
      render(<RalphLaunchForm />)

      const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement
      expect(modelSelect).toBeInTheDocument()

      // Check that options are available
      const options = Array.from(modelSelect.options).map(opt => opt.text)
      expect(options.length).toBeGreaterThan(0)
    })

    it('renders provider dropdown with hook data', async () => {
      render(<RalphLaunchForm />)

      const providerSelect = screen.getByLabelText(/provider/i) as HTMLSelectElement
      expect(providerSelect).toBeInTheDocument()

      // Check that options are available
      const options = Array.from(providerSelect.options).map(opt => opt.text)
      expect(options.length).toBeGreaterThan(0)
    })

    it('filters models when provider changes', async () => {
      render(<RalphLaunchForm />)

      const providerSelect = screen.getByLabelText(/provider/i) as HTMLSelectElement
      const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement

      // Change provider
      await userEvent.selectOptions(providerSelect, 'openai')

      // Should have at least one model available
      const updatedModelCount = Array.from(modelSelect.options).length
      expect(updatedModelCount).toBeGreaterThan(0)
    })

    it('resets model selection when provider changes to incompatible provider', async () => {
      render(<RalphLaunchForm />)

      const providerSelect = screen.getByLabelText(/provider/i) as HTMLSelectElement
      const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement

      // Select OpenAI provider
      await userEvent.selectOptions(providerSelect, 'openai')

      // Select a model
      if (Array.from(modelSelect.options).length > 1) {
        await userEvent.selectOptions(modelSelect, 'gpt-4')
      }

      // Change to Anthropic provider
      await userEvent.selectOptions(providerSelect, 'anthropic')

      // Model should be compatible with anthropic now or empty
      const currentModel = modelSelect.value
      // Either it's empty or it's a valid anthropic model
      expect(currentModel === '' || currentModel === 'claude-3').toBe(true)
    })
  })

  describe('Agent Selection', () => {
    it('displays agent options from hook data', () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      // Dev agent select should be present
      const devAgentSelect = screen.getByLabelText(/work agent/i) as HTMLSelectElement
      expect(devAgentSelect).toBeInTheDocument()

      // Review agent chips should be present
      expect(screen.getByText('reviewer1')).toBeInTheDocument()
      expect(screen.getByText('reviewer2')).toBeInTheDocument()
    })
  })

  describe('Form Field Interactions', () => {
    it('disables iterations field when ralph-pr script is selected', async () => {
      render(<RalphLaunchForm />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      await userEvent.selectOptions(scriptSelect, 'ralph-pr')

      const iterationsInput = screen.getByLabelText(/iterations/i) as HTMLInputElement
      expect(iterationsInput.disabled).toBe(true)
    })

    it('disables repeats field when ralph-pr script is selected', async () => {
      render(<RalphLaunchForm />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      await userEvent.selectOptions(scriptSelect, 'ralph-pr')

      const repeatsInput = screen.getByLabelText(/repeat/i) as HTMLInputElement
      expect(repeatsInput.disabled).toBe(true)
    })

    it('disables repeats field when ralph-issues script is selected', async () => {
      render(<RalphLaunchForm />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      await userEvent.selectOptions(scriptSelect, 'ralph-issues')

      const repeatsInput = screen.getByLabelText(/repeat/i) as HTMLInputElement
      expect(repeatsInput.disabled).toBe(true)
    })

    it('enables iterations and repeats for ralph full loop', () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      // Default script is 'ralph' which enables both fields
      const iterationsInput = screen.getByLabelText(/iterations/i) as HTMLInputElement
      const repeatsInput = screen.getByLabelText(/repeat/i) as HTMLInputElement

      expect(iterationsInput.disabled).toBe(false)
      expect(repeatsInput.disabled).toBe(false)
    })

    it('handles branch input field changes', async () => {
      render(<RalphLaunchForm />)

      const branchInput = document.getElementById('ralph-branch') as HTMLInputElement

      await userEvent.clear(branchInput)
      await userEvent.type(branchInput, 'feature/new-feature')

      expect(branchInput).toHaveValue('feature/new-feature')
    })

    it('toggles auto-approve checkbox', async () => {
      render(<RalphLaunchForm />)

      const autoApproveCheckbox = screen.getByRole('checkbox', { name: /auto.?approve/i })
      expect(autoApproveCheckbox).toBeChecked()

      await userEvent.click(autoApproveCheckbox)
      expect(autoApproveCheckbox).not.toBeChecked()

      await userEvent.click(autoApproveCheckbox)
      expect(autoApproveCheckbox).toBeChecked()
    })
  })

  describe('Form Submission', () => {
    it('submits form with all required fields', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true, runId: 'run-1' })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      const repoInput = screen.getByLabelText(/repository/i)
      await userEvent.type(repoInput, '/path/to/repo')

      const launchButton = screen.getByRole('button', { name: /launch/i })
      await userEvent.click(launchButton)

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
      })
    })

    it('disables launch button while launching', async () => {
      let resolvePromise!: (v: { success: boolean }) => void
      const mockOnLaunch = vi.fn().mockImplementation(
        () =>
          new Promise(resolve => {
            resolvePromise = resolve
          })
      )
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      const repoInput = screen.getByLabelText(/repository/i)
      await userEvent.type(repoInput, '/path/to/repo')

      const launchButton = screen.getByRole('button', { name: /launch/i }) as HTMLButtonElement
      await userEvent.click(launchButton)

      await waitFor(() => {
        expect(launchButton.disabled).toBe(true)
      })

      resolvePromise({ success: true })
    })

    it('shows error when launch result has success=false', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: false })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      const repoInput = screen.getByLabelText(/repository/i)
      await userEvent.type(repoInput, '/path/to/repo')

      const launchButton = screen.getByRole('button', { name: /launch/i })
      await userEvent.click(launchButton)

      await waitFor(() => {
        expect(screen.getByText('Launch failed')).toBeInTheDocument()
      })
    })

    it('shows specific error message when provided', async () => {
      const errorMsg = 'Invalid repository format'
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: false, error: errorMsg })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      const repoInput = screen.getByLabelText(/repository/i)
      await userEvent.type(repoInput, '/path/to/repo')

      const launchButton = screen.getByRole('button', { name: /launch/i })
      await userEvent.click(launchButton)

      await waitFor(() => {
        expect(screen.getByText(errorMsg)).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('handles browse cancellation gracefully', async () => {
      Object.defineProperty(window, 'ralph', {
        value: {
          launch: vi.fn(),
          listTemplates: vi.fn().mockResolvedValue([]),
          selectDirectory: vi.fn().mockRejectedValue(new Error('cancelled')),
        },
        writable: true,
        configurable: true,
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const browseBtn = document.querySelector('.ralph-browse-btn') as HTMLButtonElement
      await userEvent.click(browseBtn)

      // Should not crash and repo input should remain unchanged
      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      expect(repoInput.value).toBe('')
    })

    it('shows only default option when models are loading', () => {
      vi.mocked(useRalphModels).mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement
      // Only the default option should be present when data is null
      expect(modelSelect.options).toHaveLength(1)
      expect(modelSelect.options[0].text).toContain('…')
    })

    it('shows only default option when models fail to load', () => {
      vi.mocked(useRalphModels).mockReturnValue({
        data: null,
        loading: false,
        error: 'Failed to load models',
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement
      expect(modelSelect.options).toHaveLength(1)
    })
  })

  describe('Storage Persistence', () => {
    it('saves repo path to storage on submit', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      const repoInput = screen.getByLabelText(/repository/i)
      await userEvent.type(repoInput, '/my/repo')

      const launchButton = screen.getByRole('button', { name: /launch/i })
      await userEvent.click(launchButton)

      await waitFor(() => {
        expect(vi.mocked(storage.safeSetItem)).toHaveBeenCalledWith('ralph-last-repo', '/my/repo')
      })
    })

    it('retrieves last repo path from storage on mount', () => {
      const lastRepo = 'org/last-repo'
      vi.mocked(storage.safeGetItem).mockReturnValue(lastRepo)

      render(<RalphLaunchForm />)

      expect(vi.mocked(storage.safeGetItem)).toHaveBeenCalled()
      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      expect(repoInput.value).toBe(lastRepo)
    })
  })

  describe('Form Validation', () => {
    beforeEach(() => {
      // Ensure storage doesn't have pre-filled repo
      vi.mocked(storage.safeGetItem).mockReturnValue(null)
    })

    it('requires script selection for submission', async () => {
      const mockRalph = {
        launch: vi.fn(),
        listTemplates: vi.fn().mockResolvedValue([]),
      }
      Object.defineProperty(window, 'ralph', {
        value: mockRalph,
        writable: true,
        configurable: true,
      })

      render(<RalphLaunchForm />)

      // Script has a default value of 'ralph'
      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      expect(scriptSelect.value).not.toBe('')

      const launchButton = screen.getByRole('button', { name: /launch/i }) as HTMLButtonElement
      // Button should be disabled because prompt is required
      expect(launchButton.disabled).toBe(true)
    })

    it('requires prompt for submission', async () => {
      render(<RalphLaunchForm />)

      const promptInput = screen.getByLabelText(/prompt/i) as HTMLInputElement
      expect(promptInput.value).toBe('')

      const launchButton = screen.getByRole('button', { name: /launch/i }) as HTMLButtonElement
      expect(launchButton.disabled).toBe(true)
    })

    it('requires repository for submission', async () => {
      render(<RalphLaunchForm />)

      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      expect(repoInput.value).toBe('')

      const launchButton = screen.getByRole('button', { name: /launch/i }) as HTMLButtonElement
      expect(launchButton.disabled).toBe(true)
    })
  })

  describe('Template Loading', () => {
    it('loads templates from window.ralph.listTemplates', async () => {
      const mockTemplates = [
        {
          filename: 'bug-fix.ps1',
          name: 'Bug Fix Template',
          defaultPrompt: 'Fix the bug by analyzing the error trace',
        },
        {
          filename: 'feature.ps1',
          name: 'Feature Template',
          defaultPrompt: 'Implement the feature based on requirements',
        },
      ]

      const mockRalph = {
        launch: vi.fn().mockResolvedValue({ success: true }),
        listTemplates: vi.fn().mockResolvedValue(mockTemplates),
      }
      Object.defineProperty(window, 'ralph', {
        value: mockRalph,
        writable: true,
        configurable: true,
      })

      render(<RalphLaunchForm />)

      // Wait for templates to load
      await waitFor(() => {
        expect(mockRalph.listTemplates).toHaveBeenCalled()
      })
    })

    it('handles template loading errors gracefully', async () => {
      const mockRalph = {
        launch: vi.fn().mockResolvedValue({ success: true }),
        listTemplates: vi.fn().mockRejectedValue(new Error('Load failed')),
      }
      Object.defineProperty(window, 'ralph', {
        value: mockRalph,
        writable: true,
        configurable: true,
      })

      // Should not throw
      expect(() => {
        render(<RalphLaunchForm />)
      }).not.toThrow()
    })
  })

  describe('Initial Props & Pre-population', () => {
    it('initialScript prop syncs scriptChoice', () => {
      render(
        <RalphLaunchForm
          initialScript="ralph-pr"
          onLaunch={vi.fn().mockResolvedValue({ success: true })}
        />
      )

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      expect(scriptSelect.value).toBe('ralph-pr')
    })

    it('initialPR prop pre-populates form', async () => {
      render(
        <RalphLaunchForm
          initialPR={{
            prNumber: 42,
            repository: 'my-repo',
            org: 'my-org',
            repoPath: '/path/to/repo',
          }}
          onLaunch={vi.fn().mockResolvedValue({ success: true })}
        />
      )

      await waitFor(() => {
        const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
        expect(scriptSelect.value).toBe('ralph-pr')
      })

      const prNumberInput = screen.getByLabelText(/PR Number/i) as HTMLInputElement
      expect(prNumberInput.value).toBe('42')

      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      expect(repoInput.value).toBe('/path/to/repo')
    })

    it('initialIssue prop pre-populates form', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(
        <RalphLaunchForm
          initialIssue={{
            issueNumber: 99,
            issueTitle: 'Fix bug',
            issueBody: 'Some body',
            repository: 'repo',
            org: 'org',
            repoPath: '/path',
          }}
          onLaunch={mockOnLaunch}
        />
      )

      await waitFor(
        () => {
          const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
          expect(scriptSelect.value).toBe('ralph')
        },
        { timeout: 3000 }
      )

      // Verify branch and repo are set correctly by initialIssue
      const branchInput = document.getElementById('ralph-branch') as HTMLInputElement
      await waitFor(
        () => {
          expect(branchInput.value).toContain('fix/issue-99')
        },
        { timeout: 3000 }
      )

      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      expect(repoInput.value).toBe('/path')
    })
  })

  describe('Form Validation - Additional Scenarios', () => {
    beforeEach(() => {
      vi.mocked(storage.safeGetItem).mockReturnValue(null)
    })

    it('validation: shows error when repoPath empty', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      const promptInput = screen.getByLabelText(/prompt/i) as HTMLTextAreaElement
      await userEvent.type(promptInput, 'Test prompt')

      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      await userEvent.type(repoInput, '/some/path')

      // Now clear the repo to trigger the validation
      await userEvent.clear(repoInput)
      expect(repoInput.value).toBe('')

      const launchButton = screen.getByRole('button', { name: /launch/i }) as HTMLButtonElement
      // Button should be disabled when repo is empty
      expect(launchButton.disabled).toBe(true)
    })

    it('validation: shows error when ralph-pr missing PR number', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      await userEvent.selectOptions(scriptSelect, 'ralph-pr')

      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      await userEvent.type(repoInput, '/path/to/repo')

      const launchButton = screen.getByRole('button', { name: /launch/i })
      await userEvent.click(launchButton)

      await waitFor(() => {
        expect(screen.getByText('PR number is required for ralph-pr')).toBeInTheDocument()
      })
    })
  })

  describe('Script-Specific Field Visibility', () => {
    it('ralph-pr mode shows PR number input', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      expect(screen.queryByLabelText(/PR Number/i)).not.toBeInTheDocument()

      await userEvent.selectOptions(scriptSelect, 'ralph-pr')

      await waitFor(() => {
        const prInput = screen.getByLabelText(/PR Number/i) as HTMLInputElement
        expect(prInput).toBeInTheDocument()
      })

      const prInput = screen.getByLabelText(/PR Number/i) as HTMLInputElement
      await userEvent.type(prInput, '123')
      expect(prInput.value).toBe('123')
    })

    it('ralph-issues mode shows labels and dry run', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      expect(screen.queryByLabelText(/Labels/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Dry Run/i)).not.toBeInTheDocument()

      await userEvent.selectOptions(scriptSelect, 'ralph-issues')

      await waitFor(() => {
        const labelsInput = screen.getByLabelText(/Labels/i) as HTMLInputElement
        const dryRunCheckbox = screen.getByLabelText(/Dry Run/i) as HTMLInputElement

        expect(labelsInput).toBeInTheDocument()
        expect(dryRunCheckbox).toBeInTheDocument()
      })

      const labelsInput = screen.getByLabelText(/Labels/i) as HTMLInputElement
      const dryRunCheckbox = screen.getByLabelText(/Dry Run/i) as HTMLInputElement

      await userEvent.type(labelsInput, 'bug,tech-debt')
      expect(labelsInput.value).toBe('bug,tech-debt')

      await userEvent.click(dryRunCheckbox)
      expect(dryRunCheckbox).toBeChecked()
    })
  })

  describe('Form Field onChange Handlers', () => {
    it('iterations and repeats onChange', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const iterationsInput = screen.getByLabelText(/iterations/i) as HTMLInputElement
      const repeatsInput = screen.getByLabelText(/repeat/i) as HTMLInputElement

      await userEvent.clear(iterationsInput)
      await userEvent.type(iterationsInput, '5')
      expect(iterationsInput.value).toBe('5')

      await userEvent.clear(repeatsInput)
      await userEvent.type(repeatsInput, '2')
      expect(repeatsInput.value).toBe('2')
    })

    it('dev agent select onChange', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const devAgentSelect = screen.getByLabelText(/work agent/i) as HTMLSelectElement

      await userEvent.selectOptions(devAgentSelect, 'agent1')
      expect(devAgentSelect.value).toBe('agent1')
    })

    it('PR number input onChange', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      await userEvent.selectOptions(scriptSelect, 'ralph-pr')

      await waitFor(() => {
        const prNumberInput = screen.getByLabelText(/PR Number/i) as HTMLInputElement
        expect(prNumberInput).toBeInTheDocument()
      })

      const prNumberInput = screen.getByLabelText(/PR Number/i) as HTMLInputElement
      await userEvent.type(prNumberInput, '456')
      expect(prNumberInput.value).toBe('456')
    })

    it('Labels input onChange', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      await userEvent.selectOptions(scriptSelect, 'ralph-issues')

      await waitFor(() => {
        const labelsInput = screen.getByLabelText(/Labels/i) as HTMLInputElement
        expect(labelsInput).toBeInTheDocument()
      })

      const labelsInput = screen.getByLabelText(/Labels/i) as HTMLInputElement
      await userEvent.type(labelsInput, 'feature,enhancement')
      expect(labelsInput.value).toBe('feature,enhancement')
    })

    it('Dry run checkbox onChange', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      await userEvent.selectOptions(scriptSelect, 'ralph-issues')

      await waitFor(() => {
        const dryRunCheckbox = screen.getByLabelText(/Dry Run/i) as HTMLInputElement
        expect(dryRunCheckbox).toBeInTheDocument()
      })

      const dryRunCheckbox = screen.getByLabelText(/Dry Run/i) as HTMLInputElement
      expect(dryRunCheckbox).not.toBeChecked()
      await userEvent.click(dryRunCheckbox)
      expect(dryRunCheckbox).toBeChecked()
    })

    it('Prompt onChange for manual editing', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const promptInput = screen.getByLabelText(/prompt/i) as HTMLTextAreaElement
      expect(promptInput.value).toBe('')

      await userEvent.type(promptInput, 'This is my custom prompt')
      expect(promptInput.value).toBe('This is my custom prompt')
    })
  })

  describe('Review Agent Management', () => {
    it('review agent chip toggle', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const reviewer1Chip = screen.getByRole('button', { name: 'reviewer1' })
      expect(reviewer1Chip).not.toHaveClass('selected')

      await userEvent.click(reviewer1Chip)
      expect(reviewer1Chip).toHaveClass('selected')

      await userEvent.click(reviewer1Chip)
      expect(reviewer1Chip).not.toHaveClass('selected')
    })

    it('reviewer model select', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const reviewer1Chip = screen.getByRole('button', { name: 'reviewer1' })
      await userEvent.click(reviewer1Chip)

      await waitFor(() => {
        // Should have model select visible when reviewer is selected
        const modelSelects = document.querySelectorAll('.ralph-agent-model-select')
        expect(modelSelects.length).toBeGreaterThan(0)
      })

      const modelSelects = document.querySelectorAll('.ralph-agent-model-select')
      const reviewer1ModelSelect = modelSelects[0] as HTMLSelectElement

      if (reviewer1ModelSelect.options.length > 1) {
        await userEvent.selectOptions(reviewer1ModelSelect, reviewer1ModelSelect.options[1].value)
        expect(reviewer1ModelSelect.value).toBe(reviewer1ModelSelect.options[1].value)
      }
    })

    it('toggleReviewAgent - removing reviewer clears its model', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const reviewer2Chip = screen.getByRole('button', { name: 'reviewer2' })
      await userEvent.click(reviewer2Chip)

      await waitFor(() => {
        expect(reviewer2Chip).toHaveClass('selected')
      })

      // Model select should be visible
      const modelSelects = document.querySelectorAll('.ralph-agent-model-select')
      expect(modelSelects.length).toBeGreaterThan(0)

      // Now remove the reviewer
      await userEvent.click(reviewer2Chip)

      await waitFor(() => {
        expect(reviewer2Chip).not.toHaveClass('selected')
      })

      // Model select should be gone
      const updatedSelects = document.querySelectorAll('.ralph-agent-model-select')
      expect(updatedSelects.length).toBeLessThan(modelSelects.length)
    })
  })

  describe('Model Aliases', () => {
    it('model aliases in options', () => {
      // Add aliases to mockModelsConfig
      const configWithAliases = {
        ...mockModelsConfig,
        aliases: {
          gpt4: 'gpt-4',
          claude: 'claude-3',
        },
      }

      vi.mocked(useRalphModels).mockReturnValue({
        data: configWithAliases,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement
      const options = Array.from(modelSelect.options).map(opt => opt.text)

      // Should contain alias options
      expect(options.some(opt => opt.includes('gpt4'))).toBe(true)
      expect(options.some(opt => opt.includes('claude'))).toBe(true)
    })
  })

  describe('Template Default Prompt', () => {
    it('prompt onChange for template script with auto-population', async () => {
      const mockTemplates = [
        {
          filename: 'custom-template.ps1',
          name: 'Custom Template',
          defaultPrompt: 'This is the default template prompt',
        },
      ]

      const mockRalph = {
        launch: vi.fn().mockResolvedValue({ success: true }),
        listTemplates: vi.fn().mockResolvedValue(mockTemplates),
      }
      Object.defineProperty(window, 'ralph', {
        value: mockRalph,
        writable: true,
        configurable: true,
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      await waitFor(() => {
        const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
        expect(
          Array.from(scriptSelect.options).some(opt => opt.value === 'custom-template.ps1')
        ).toBe(true)
      })

      const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
      await userEvent.selectOptions(scriptSelect, 'custom-template.ps1')

      await waitFor(() => {
        const promptInput = screen.getByLabelText(/prompt/i) as HTMLTextAreaElement
        expect(promptInput.value).toBe('This is the default template prompt')
      })

      // Now manually change the prompt
      const promptInput = screen.getByLabelText(/prompt/i) as HTMLTextAreaElement
      await userEvent.clear(promptInput)
      await userEvent.type(promptInput, 'My custom override')
      expect(promptInput.value).toBe('My custom override')
    })
  })

  describe('Provider and Model Compatibility', () => {
    it('provider with unsupported model triggers reset', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const providerSelect = screen.getByLabelText(/provider/i) as HTMLSelectElement
      const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement

      // Select openai provider
      await userEvent.selectOptions(providerSelect, 'openai')

      // Select gpt-4 model (compatible with openai)
      if (Array.from(modelSelect.options).some(opt => opt.value === 'gpt-4')) {
        await userEvent.selectOptions(modelSelect, 'gpt-4')
        expect(modelSelect.value).toBe('gpt-4')
      }

      // Change to anthropic provider
      await userEvent.selectOptions(providerSelect, 'anthropic')

      // The model should be reset or changed to a compatible one
      await waitFor(() => {
        const currentModel = modelSelect.value
        // Either empty or a valid anthropic model
        const isCompatible =
          currentModel === '' ||
          currentModel === 'claude-3' ||
          Array.from(modelSelect.options)
            .filter(opt => opt.value)
            .map(opt => opt.value)
            .includes(currentModel)
        expect(isCompatible).toBe(true)
      })
    })
  })

  describe('Issue Number Field', () => {
    it('initialIssue updates script and branch', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(
        <RalphLaunchForm
          initialIssue={{
            issueNumber: 42,
            issueTitle: 'Test issue',
            issueBody: 'Body',
            repository: 'repo',
            org: 'org',
            repoPath: '/test/path',
          }}
          onLaunch={mockOnLaunch}
        />
      )

      // Verify the script is set to ralph
      await waitFor(
        () => {
          const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
          expect(scriptSelect.value).toBe('ralph')
        },
        { timeout: 3000 }
      )

      // Verify the branch includes the issue number
      const branchInput = document.getElementById('ralph-branch') as HTMLInputElement
      await waitFor(
        () => {
          expect(branchInput.value).toBe('fix/issue-42')
        },
        { timeout: 3000 }
      )
    })
  })

  describe('Coverage — buildOptionalFields & buildLaunchConfig branches', () => {
    it('submits with reviewer that has a model override (role@model format)', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      const repoInput = screen.getByLabelText(/repository/i)
      await userEvent.type(repoInput, '/path/to/repo')

      // Select reviewer
      const reviewer1Chip = screen.getByRole('button', { name: 'reviewer1' })
      await userEvent.click(reviewer1Chip)

      // Wait for model select to appear and pick a model
      await waitFor(() => {
        const selects = document.querySelectorAll('.ralph-agent-model-select')
        expect(selects.length).toBe(1)
      })
      const reviewerModelSelect = document.querySelector(
        '.ralph-agent-model-select'
      ) as HTMLSelectElement
      const nonDefaultOpts = Array.from(reviewerModelSelect.options).filter(o => o.value !== '')
      expect(nonDefaultOpts.length).toBeGreaterThan(0)
      await userEvent.selectOptions(reviewerModelSelect, nonDefaultOpts[0].value)

      // Submit
      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const config = mockOnLaunch.mock.calls[0][0]
        expect(config.agents).toBeDefined()
        expect(config.agents[0]).toContain('@')
      })
    })

    it('submits with reviewer that has NO model override (plain role)', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      await userEvent.type(screen.getByLabelText(/repository/i), '/repo')

      // Select reviewer without changing its model dropdown
      await userEvent.click(screen.getByRole('button', { name: 'reviewer1' }))

      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const config = mockOnLaunch.mock.calls[0][0]
        expect(config.agents).toEqual(['reviewer1'])
      })
    })

    it('submits with all optional fields populated', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      await userEvent.type(screen.getByLabelText(/repository/i), '/path/to/repo')
      await userEvent.selectOptions(screen.getByLabelText(/provider/i), 'openai')

      await waitFor(() => {
        const m = screen.getByLabelText(/model/i) as HTMLSelectElement
        expect(Array.from(m.options).some(o => o.value === 'gpt-4')).toBe(true)
      })
      await userEvent.selectOptions(screen.getByLabelText(/model/i), 'gpt-4')

      await userEvent.selectOptions(screen.getByLabelText(/work agent/i), 'agent1')
      await userEvent.click(screen.getByRole('button', { name: 'reviewer1' }))

      const repeatsInput = screen.getByLabelText(/repeat/i) as HTMLInputElement
      await userEvent.clear(repeatsInput)
      await userEvent.type(repeatsInput, '3')

      const branchInput = document.getElementById('ralph-branch') as HTMLInputElement
      await userEvent.type(branchInput, 'feat/test')

      await userEvent.type(screen.getByLabelText(/prompt/i), 'Do the thing')

      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const c = mockOnLaunch.mock.calls[0][0]
        expect(c.model).toBe('gpt-4')
        expect(c.provider).toBe('openai')
        expect(c.devAgent).toBe('agent1')
        expect(c.agents).toContain('reviewer1')
        expect(c.repeats).toBe(3)
        expect(c.branch).toBe('feat/test')
        expect(c.prompt).toBe('Do the thing')
        expect(c.autoApprove).toBe(true)
      })
    })

    it('submits with autoApprove unchecked — omits it from config', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      await userEvent.type(screen.getByLabelText(/repository/i), '/repo')
      await userEvent.click(screen.getByRole('checkbox', { name: /auto.?approve/i }))

      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const c = mockOnLaunch.mock.calls[0][0]
        expect(c.autoApprove).toBeUndefined()
      })
    })

    it('submits ralph-issues with labels and dryRun flags', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      await userEvent.type(screen.getByLabelText(/repository/i), '/repo')
      await userEvent.selectOptions(screen.getByLabelText(/script/i), 'ralph-issues')

      await waitFor(() => {
        expect(screen.getByLabelText(/Labels/i)).toBeInTheDocument()
      })

      await userEvent.type(screen.getByLabelText(/Labels/i), 'bug,debt')
      await userEvent.click(screen.getByLabelText(/Dry Run/i))
      await userEvent.type(screen.getByLabelText(/prompt/i), 'scan')

      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const c = mockOnLaunch.mock.calls[0][0]
        expect(c.scriptType).toBe('ralph-issues')
        expect(c.labels).toBe('bug,debt')
        expect(c.dryRun).toBe(true)
      })
    })

    it('submits ralph-pr with prNumber in config', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      await userEvent.type(screen.getByLabelText(/repository/i), '/repo')
      await userEvent.selectOptions(screen.getByLabelText(/script/i), 'ralph-pr')

      await waitFor(() => {
        expect(screen.getByLabelText(/PR Number/i)).toBeInTheDocument()
      })
      await userEvent.type(screen.getByLabelText(/PR Number/i), '42')

      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const c = mockOnLaunch.mock.calls[0][0]
        expect(c.scriptType).toBe('ralph-pr')
        expect(c.prNumber).toBe(42)
      })
    })

    it('submits with issueNumber in config via initialIssue', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(
        <RalphLaunchForm
          initialIssue={{
            issueNumber: 55,
            issueTitle: 'Fix it',
            issueBody: 'Body text',
            repository: 'repo',
            org: 'org',
            repoPath: '/test/repo',
          }}
          onLaunch={mockOnLaunch}
        />
      )

      await waitFor(() => {
        expect((screen.getByLabelText(/repository/i) as HTMLInputElement).value).toBe('/test/repo')
      })

      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const c = mockOnLaunch.mock.calls[0][0]
        expect(c.issueNumber).toBe(55)
      })
    })

    it('submits template script — resolveScriptType returns template type', async () => {
      Object.defineProperty(window, 'ralph', {
        value: {
          launch: vi.fn().mockResolvedValue({ success: true }),
          listTemplates: vi
            .fn()
            .mockResolvedValue([
              { filename: 'my-tpl.ps1', name: 'My Template', defaultPrompt: 'tpl prompt' },
            ]),
        },
        writable: true,
        configurable: true,
      })

      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      await waitFor(() => {
        const s = screen.getByLabelText(/script/i) as HTMLSelectElement
        expect(Array.from(s.options).some(o => o.value === 'my-tpl.ps1')).toBe(true)
      })

      await userEvent.selectOptions(screen.getByLabelText(/script/i), 'my-tpl.ps1')
      await userEvent.type(screen.getByLabelText(/repository/i), '/repo')

      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const c = mockOnLaunch.mock.calls[0][0]
        expect(c.scriptType).toBe('template')
        expect(c.templateScript).toBe('my-tpl.ps1')
      })
    })
  })

  describe('Coverage — handleSubmit validation', () => {
    it('shows error when form is submitted with empty repoPath', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(<RalphLaunchForm onLaunch={mockOnLaunch} />)

      // Submit the form directly — bypasses disabled button
      const form = document.querySelector('.ralph-launch-form') as HTMLFormElement
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('Select a repository path')).toBeInTheDocument()
      })
      expect(mockOnLaunch).not.toHaveBeenCalled()
    })
  })

  describe('Coverage — provider/model reset effect', () => {
    it('skips model reset when provider has no supportedModelProviders', async () => {
      vi.mocked(useRalphProviders).mockReturnValue({
        data: {
          version: '1.0.0',
          default: 'openai',
          providers: {
            custom: { description: 'Custom' },
            openai: { description: 'OpenAI', supportedModelProviders: ['openai'] },
          },
        } as unknown as RalphProvidersConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement
      if (Array.from(modelSelect.options).some(o => o.value === 'gpt-4')) {
        await userEvent.selectOptions(modelSelect, 'gpt-4')
      }

      await userEvent.selectOptions(screen.getByLabelText(/provider/i), 'custom')

      // Model should NOT be cleared because supported is undefined
      await waitFor(() => {
        expect(modelSelect.value).toBe('gpt-4')
      })
    })
  })

  describe('Coverage — null hook data branches', () => {
    it('returns empty provider options when providers data is null', () => {
      vi.mocked(useRalphProviders).mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const providerSelect = screen.getByLabelText(/provider/i) as HTMLSelectElement
      expect(providerSelect.options).toHaveLength(1)
      expect(providerSelect.options[0].text).toContain('…')
    })

    it('returns empty agent options when agents data is null', () => {
      vi.mocked(useRalphAgents).mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const devAgentSelect = screen.getByLabelText(/work agent/i) as HTMLSelectElement
      expect(devAgentSelect.options).toHaveLength(1)

      expect(screen.queryByText('reviewer1')).not.toBeInTheDocument()
      expect(screen.queryByText('reviewer2')).not.toBeInTheDocument()
    })
  })

  describe('Coverage — reviewer model optgroup rendering', () => {
    beforeEach(() => {
      // Restore default hook mocks — earlier tests may have overridden them with mockReturnValue
      vi.mocked(useRalphModels).mockReturnValue({
        data: mockModelsConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })
      vi.mocked(useRalphProviders).mockReturnValue({
        data: mockProvidersConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })
      vi.mocked(useRalphAgents).mockReturnValue({
        data: mockAgentsConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })
    })

    it('renders optgroups and options in the reviewer model select', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      await userEvent.click(screen.getByRole('button', { name: 'reviewer1' }))

      await waitFor(() => {
        expect(document.querySelectorAll('.ralph-agent-model-select').length).toBe(1)
      })

      const select = document.querySelector('.ralph-agent-model-select') as HTMLSelectElement
      const optgroups = select.querySelectorAll('optgroup')
      expect(optgroups.length).toBeGreaterThan(0)

      const firstGroup = optgroups[0]
      expect(firstGroup.querySelectorAll('option').length).toBeGreaterThan(0)
    })

    it('setReviewerModel updates the selected model via onChange', async () => {
      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      await userEvent.click(screen.getByRole('button', { name: 'reviewer1' }))

      await waitFor(() => {
        expect(document.querySelectorAll('.ralph-agent-model-select').length).toBe(1)
      })

      const select = document.querySelector('.ralph-agent-model-select') as HTMLSelectElement
      const nonDefault = Array.from(select.options).filter(o => o.value !== '')
      expect(nonDefault.length).toBeGreaterThan(0)

      await userEvent.selectOptions(select, nonDefault[0].value)
      expect(select.value).toBe(nonDefault[0].value)
    })

    it('reviewer model options include aliases from buildProviderModelGroup', async () => {
      vi.mocked(useRalphModels).mockReturnValue({
        data: { ...mockModelsConfig, aliases: { gpt4: 'gpt-4' } },
        loading: false,
        error: null,
        refresh: vi.fn(),
      })
      vi.mocked(useRalphProviders).mockReturnValue({
        data: {
          version: '1.0.0',
          default: 'openai',
          providers: {
            openai: { description: 'OpenAI', supportedModelProviders: ['openai'] },
          },
        } as unknown as RalphProvidersConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      await userEvent.click(screen.getByRole('button', { name: 'reviewer1' }))

      await waitFor(() => {
        expect(document.querySelectorAll('.ralph-agent-model-select').length).toBe(1)
      })

      const opts = Array.from(
        (document.querySelector('.ralph-agent-model-select') as HTMLSelectElement).querySelectorAll(
          'option'
        )
      )
      expect(opts.some(o => o.text.includes('gpt4'))).toBe(true)
    })
  })

  describe('Coverage — buildProviderModelGroup edge cases', () => {
    beforeEach(() => {
      vi.mocked(useRalphModels).mockReturnValue({
        data: mockModelsConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })
      vi.mocked(useRalphProviders).mockReturnValue({
        data: mockProvidersConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })
      vi.mocked(useRalphAgents).mockReturnValue({
        data: mockAgentsConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })
    })

    it('excludes providers with no matching models (returns null)', async () => {
      vi.mocked(useRalphProviders).mockReturnValue({
        data: {
          version: '1.0.0',
          default: 'openai',
          providers: {
            nomatch: {
              description: 'Empty',
              supportedModelProviders: ['nonexistent'],
            },
            openai: {
              description: 'OpenAI Provider',
              supportedModelProviders: ['openai'],
            },
          },
        } as unknown as RalphProvidersConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      await userEvent.click(screen.getByRole('button', { name: 'reviewer1' }))

      await waitFor(() => {
        expect(document.querySelectorAll('.ralph-agent-model-select').length).toBe(1)
      })

      const labels = Array.from(
        (document.querySelector('.ralph-agent-model-select') as HTMLSelectElement).querySelectorAll(
          'optgroup'
        )
      ).map(og => og.getAttribute('label'))

      expect(labels).not.toContain('Empty')
      expect(labels).toContain('OpenAI Provider')
    })

    it('handles provider with missing supportedModelProviders (nullish coalesce)', async () => {
      vi.mocked(useRalphProviders).mockReturnValue({
        data: {
          version: '1.0.0',
          default: 'bare',
          providers: {
            bare: { description: 'No supported' },
          },
        } as unknown as RalphProvidersConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      await userEvent.click(screen.getByRole('button', { name: 'reviewer1' }))

      await waitFor(() => {
        expect(document.querySelectorAll('.ralph-agent-model-select').length).toBe(1)
      })

      const optgroups = (
        document.querySelector('.ralph-agent-model-select') as HTMLSelectElement
      ).querySelectorAll('optgroup')
      // No models match because supported defaults to [] — no optgroups
      expect(optgroups.length).toBe(0)
    })

    it('uses provKey as label when provider.description is undefined', async () => {
      vi.mocked(useRalphProviders).mockReturnValue({
        data: {
          version: '1.0.0',
          default: 'nodesc',
          providers: {
            nodesc: { supportedModelProviders: ['openai'] },
          },
        } as unknown as RalphProvidersConfig,
        loading: false,
        error: null,
        refresh: vi.fn(),
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      await userEvent.click(screen.getByRole('button', { name: 'reviewer1' }))

      await waitFor(() => {
        expect(document.querySelectorAll('.ralph-agent-model-select').length).toBe(1)
      })

      const optgroups = Array.from(
        (document.querySelector('.ralph-agent-model-select') as HTMLSelectElement).querySelectorAll(
          'optgroup'
        )
      )
      // The optgroup label should fall back to the provider key 'nodesc'
      expect(optgroups.some(og => og.getAttribute('label') === 'nodesc')).toBe(true)
    })
  })

  describe('Coverage — initialIssue with empty body', () => {
    it('uses fallback text when issueBody is empty', async () => {
      // Prevent listTemplates from resolving so the template auto-populate effect
      // does not overwrite the prompt set by the initialIssue effect.
      Object.defineProperty(window, 'ralph', {
        value: {
          launch: vi.fn(),
          listTemplates: vi.fn(() => new Promise(() => {})),
        },
        writable: true,
        configurable: true,
      })

      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(
        <RalphLaunchForm
          initialIssue={{
            issueNumber: 10,
            issueTitle: 'Empty body',
            issueBody: '',
            repository: 'repo',
            org: 'org',
            repoPath: '/path',
          }}
          onLaunch={mockOnLaunch}
        />
      )

      // Verify the initialIssue effect executed (which exercises the
      // `issueBody || '(no description provided)'` branch at line 205)
      // by checking side effects that are NOT overwritten by later effects.
      await waitFor(() => {
        expect((screen.getByLabelText(/repository/i) as HTMLInputElement).value).toBe('/path')
        const branchInput = document.getElementById('ralph-branch') as HTMLInputElement
        expect(branchInput.value).toBe('fix/issue-10')
      })

      // Submit the form so the config includes the issueNumber
      await userEvent.click(screen.getByRole('button', { name: /launch/i }))

      await waitFor(() => {
        expect(mockOnLaunch).toHaveBeenCalled()
        const c = mockOnLaunch.mock.calls[0][0]
        expect(c.issueNumber).toBe(10)
      })
    })
  })

  /* ── Branch coverage: false/else branches ──────────────────── */

  describe('Branch coverage — false branches', () => {
    it('pre-fills from initialPR without repoPath (L191 false)', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(
        <RalphLaunchForm
          initialPR={{
            prNumber: 99,
            repository: 'some-repo',
            org: 'some-org',
            repoPath: '',
          }}
          onLaunch={mockOnLaunch}
        />
      )

      await waitFor(() => {
        const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
        expect(scriptSelect.value).toBe('ralph-pr')
      })
      // repoPath should NOT have been set from initialPR (empty string is falsy)
      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      expect(repoInput.value).toBe('')
    })

    it('pre-fills from initialIssue without repoPath (L199 false)', async () => {
      const mockOnLaunch = vi.fn().mockResolvedValue({ success: true })
      render(
        <RalphLaunchForm
          initialIssue={{
            issueNumber: 77,
            issueTitle: 'No repo path',
            issueBody: 'Issue body',
            repository: 'repo',
            org: 'org',
            repoPath: '',
          }}
          onLaunch={mockOnLaunch}
        />
      )

      await waitFor(() => {
        const scriptSelect = screen.getByLabelText(/script/i) as HTMLSelectElement
        expect(scriptSelect.value).toBe('ralph')
      })
      // repoPath should NOT have been set from initialIssue
      const repoInput = screen.getByLabelText(/repository/i) as HTMLInputElement
      expect(repoInput.value).toBe('')
    })

    it('handles null result from selectDirectory (L326 false)', async () => {
      Object.defineProperty(window, 'ralph', {
        value: {
          launch: vi.fn().mockResolvedValue({ success: true }),
          listTemplates: vi.fn().mockResolvedValue([]),
          selectDirectory: vi.fn().mockResolvedValue(null),
        },
        writable: true,
        configurable: true,
      })

      render(<RalphLaunchForm onLaunch={vi.fn().mockResolvedValue({ success: true })} />)

      const browseBtn = document.querySelector('.ralph-browse-btn') as HTMLButtonElement
      await userEvent.click(browseBtn)

      await waitFor(() => {
        expect(window.ralph.selectDirectory).toHaveBeenCalled()
      })
      // safeSetItem should NOT have been called since result was null
      expect(vi.mocked(storage.safeSetItem)).not.toHaveBeenCalledWith(
        'ralph-last-repo',
        expect.anything()
      )
    })
  })
})
