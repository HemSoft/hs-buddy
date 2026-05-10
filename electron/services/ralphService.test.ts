import { describe, it, expect, vi, beforeEach } from 'vitest'

type MockChildProcess = ReturnType<typeof createMockProcess>

function createMockProcess() {
  const stdoutHandlers = new Map<string, (data: Buffer) => void>()
  const stderrHandlers = new Map<string, (data: Buffer) => void>()
  const processHandlers = new Map<string, (...args: unknown[]) => void>()

  return {
    stdout: {
      on: vi.fn((event: string, handler: (data: Buffer) => void) => {
        stdoutHandlers.set(event, handler)
      }),
    },
    stderr: {
      on: vi.fn((event: string, handler: (data: Buffer) => void) => {
        stderrHandlers.set(event, handler)
      }),
    },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      processHandlers.set(event, handler)
    }),
    kill: vi.fn(),
    pid: 12345,
    emitStdout(text: string) {
      stdoutHandlers.get('data')?.(Buffer.from(text))
    },
    emitStderr(text: string) {
      stderrHandlers.get('data')?.(Buffer.from(text))
    },
    emitClose(code: number | null) {
      processHandlers.get('close')?.(code)
    },
    emitError(error: Error) {
      processHandlers.get('error')?.(error)
    },
  }
}

const spawnedProcesses: MockChildProcess[] = []
const mockExecSync = vi.fn((..._args: unknown[]) => '')
const mockSpawn = vi.fn((..._args: unknown[]) => {
  const proc = createMockProcess()
  spawnedProcesses.push(proc)
  return proc
})

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

const mockExistsSync = vi.fn().mockReturnValue(false)
const mockReadFileSync = vi.fn()
const mockReaddirSync = vi.fn().mockReturnValue([])
const mockWriteFileSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}))

vi.mock('url', () => ({
  fileURLToPath: vi.fn(() => '/mock/service'),
}))

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}))

vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}))

import { randomUUID } from 'crypto'
import {
  setStatusChangeCallback,
  listLoops,
  getScriptsPath,
  getConfig,
  launchLoop,
  stopLoop,
  getLoopStatus,
  listTemplateScripts,
  initRalphService,
  shutdownRalphService,
} from './ralphService'

const validModelsConfig = {
  version: '1.0.0',
  models: {
    'gpt-4.1': {
      label: 'GPT-4.1',
      costMultiplier: 1,
      provider: 'copilot',
      reasoningEffort: 'high',
    },
  },
  aliases: { fast: 'gpt-4.1' },
  tiers: {
    standard: {
      model: 'gpt-4.1',
      description: 'Standard tier',
    },
  },
  default: 'gpt-4.1',
}

const normalizePath = (value: unknown) => String(value).replaceAll('\\', '/')
const buildConfig = (overrides: Partial<Parameters<typeof launchLoop>[0]> = {}) =>
  ({
    repoPath: '/repo',
    scriptType: 'ralph',
    ...overrides,
  }) as Parameters<typeof launchLoop>[0]

function launchRunningLoop(overrides: Partial<Parameters<typeof launchLoop>[0]> = {}) {
  mockExistsSync.mockReturnValue(true)
  const result = launchLoop(buildConfig(overrides))
  expect(result).toEqual({ success: true, runId: 'test-uuid-1234' })
  return { result, proc: spawnedProcesses.at(-1)! }
}

describe('ralphService', () => {
  beforeEach(() => {
    setStatusChangeCallback(null)
    shutdownRalphService()
    vi.clearAllMocks()
    spawnedProcesses.length = 0
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReturnValue(JSON.stringify(validModelsConfig))
    mockReaddirSync.mockReturnValue([])
    mockWriteFileSync.mockReset()
    mockExecSync.mockReturnValue('')
  })

  describe('setStatusChangeCallback', () => {
    it('accepts a callback', () => {
      expect(() => setStatusChangeCallback(vi.fn())).not.toThrow()
    })

    it('accepts null', () => {
      expect(() => setStatusChangeCallback(null)).not.toThrow()
    })
  })

  describe('listLoops', () => {
    it('returns an array', () => {
      expect(Array.isArray(listLoops())).toBe(true)
    })
  })

  describe('getScriptsPath', () => {
    it('throws when scripts directory not found', () => {
      mockExistsSync.mockReturnValue(false)
      expect(() => getScriptsPath()).toThrow('Ralph scripts not found')
    })

    it('returns path when scripts directory exists', () => {
      mockExistsSync.mockReturnValue(true)
      const path = getScriptsPath()
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    })
  })

  describe('getConfig', () => {
    it('reads models, agents, and providers config files', () => {
      mockExistsSync.mockImplementation(path => {
        const filePath = normalizePath(path)
        return filePath.includes('/scripts/ralph-loops')
      })
      mockReadFileSync.mockImplementation(path => {
        const filePath = normalizePath(path)
        if (filePath.endsWith('/models.json')) {
          return JSON.stringify(validModelsConfig)
        }
        if (filePath.endsWith('/agents.json')) {
          return JSON.stringify({
            version: '1.0.0',
            defaults: { devAgent: 'anvil' },
            roles: {
              anvil: {
                category: 'dev',
                description: 'Primary developer agent',
                agent: { copilot: 'anvil' },
                tier: 'standard',
                skills: ['debug'],
              },
            },
          })
        }
        if (filePath.endsWith('/providers.json')) {
          return JSON.stringify({
            version: '1.0.0',
            providers: {
              copilot: {
                command: 'copilot',
                description: 'GitHub Copilot',
                promptStyle: 'flag',
                flags: {},
                modelTemplate: '{model}',
                supportsNativePrReview: true,
              },
            },
            default: 'copilot',
          })
        }
        return '{}'
      })

      expect(getConfig('models')).toMatchObject({ default: 'gpt-4.1' })
      expect(getConfig('agents')).toMatchObject({ defaults: { devAgent: 'anvil' } })
      expect(getConfig('providers')).toMatchObject({ default: 'copilot' })
    })

    it('throws when a config file is missing', () => {
      mockExistsSync.mockImplementation(path => {
        const filePath = normalizePath(path)
        if (filePath.endsWith('/config/models.json')) return false
        return filePath.includes('/scripts/ralph-loops')
      })

      expect(() => getConfig('models')).toThrow('Config file not found')
    })
  })

  describe('launchLoop - config validation', () => {
    it('returns error for missing repoPath', () => {
      const result = launchLoop({ repoPath: '', scriptType: 'ralph' } as Parameters<
        typeof launchLoop
      >[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('repoPath must be an absolute path')
    })

    it('returns error for relative repoPath', () => {
      const result = launchLoop({ repoPath: 'relative/path', scriptType: 'ralph' } as Parameters<
        typeof launchLoop
      >[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('repoPath must be an absolute path')
    })

    it('returns error when repoPath does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const result = launchLoop({
        repoPath: '/missing',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('does not exist')
    })

    it('returns error for forbidden characters in repoPath', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/path;with-semicolon',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('forbidden characters')
    })

    it('returns error for invalid scriptType', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/repo',
        scriptType: 'invalid' as 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid scriptType')
    })

    it('returns error for invalid model and provider', () => {
      mockExistsSync.mockReturnValue(true)

      const invalidModel = launchLoop(buildConfig({ model: 'unknown-model' }))
      expect(invalidModel.success).toBe(false)
      expect(invalidModel.error).toContain('Unknown model: unknown-model')

      const invalidProvider = launchLoop(buildConfig({ provider: 'invalid' as 'copilot' }))
      expect(invalidProvider.success).toBe(false)
      expect(invalidProvider.error).toContain('Invalid provider')
    })

    it('returns error when ralph-pr is missing prNumber', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/repo',
        scriptType: 'ralph-pr',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('PR number is required')
    })

    it('returns error for iterations out of range and repeats out of range', () => {
      mockExistsSync.mockReturnValue(true)

      const invalidIterations = launchLoop(buildConfig({ iterations: 200 }))
      expect(invalidIterations.success).toBe(false)
      expect(invalidIterations.error).toContain('iterations must be between 1 and 100')

      const invalidRepeats = launchLoop(buildConfig({ repeats: 60 }))
      expect(invalidRepeats.success).toBe(false)
      expect(invalidRepeats.error).toContain('repeats must be between 1 and 50')
    })

    it('returns error for invalid workUntil format', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop(buildConfig({ workUntil: 'invalid' }))
      expect(result.success).toBe(false)
      expect(result.error).toContain('workUntil must be HH:mm format')
    })
  })

  describe('launchLoop - successful spawn', () => {
    it('spawns process and returns runId on valid config', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop(buildConfig())

      expect(result.success).toBe(true)
      expect(result.runId).toBe('test-uuid-1234')
      expect(mockSpawn).toHaveBeenCalledWith(
        'pwsh',
        expect.arrayContaining(['-NoProfile', '-File']),
        expect.objectContaining({ cwd: '/repo', shell: false })
      )
    })

    it('builds optional args for standard ralph runs', () => {
      mockExistsSync.mockReturnValue(true)

      launchLoop(
        buildConfig({
          model: 'fast',
          provider: 'copilot',
          devAgent: 'anvil',
          agents: ['reviewer'],
          iterations: 3,
          workUntil: '17:30',
          branch: 'feature/test',
          prompt: 'Quick prompt',
          noAudio: true,
          skipReview: true,
          autoApprove: true,
          noPR: true,
        })
      )

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toEqual(
        expect.arrayContaining([
          '-Autopilot',
          '-Model',
          'fast',
          '-Provider',
          'copilot',
          '-Agents',
          'anvil,reviewer',
          '-Max',
          '3',
          '-WorkUntil',
          '17:30',
          '-Branch',
          'feature/test',
          '-Prompt',
          'Quick prompt',
          '-NoAudio',
          '-SkipReview',
          '-AutoApprove',
          '-NoPR',
        ])
      )
      expect(args).not.toContain('-DevAgent')
    })

    it('builds ralph-pr args with separate dev agent and reviewers', () => {
      mockExistsSync.mockReturnValue(true)

      launchLoop(
        buildConfig({
          scriptType: 'ralph-pr',
          prNumber: 42,
          devAgent: 'anvil',
          agents: ['reviewer'],
          prompt: 'Review this PR',
        })
      )

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toEqual(
        expect.arrayContaining([
          '-Autopilot',
          '-DevAgent',
          'anvil',
          '-Agents',
          'reviewer',
          '-Prompt',
          'Review this PR',
          '-PRNumber',
          '42',
        ])
      )
    })

    it('writes long prompts to a temp file and uses the repeat wrapper', () => {
      mockExistsSync.mockReturnValue(true)
      const prompt = `Line one\n${'x'.repeat(600)}`

      launchLoop(
        buildConfig({
          prompt,
          repeats: 2,
          noAudio: true,
        })
      )

      const args = mockSpawn.mock.calls[0][1] as string[]
      const promptPath = args[args.indexOf('-Prompt') + 1]
      expect(normalizePath(args[args.indexOf('-File') + 1])).toContain(
        '/scripts/ralph-loops/scripts/ralph-repeat.ps1'
      )
      expect(normalizePath(args[args.indexOf('-Script') + 1])).toContain(
        '/scripts/ralph-loops/ralph.ps1'
      )
      expect(args).toEqual(expect.arrayContaining(['-Times', '2', '-NoAudio']))
      expect(normalizePath(promptPath)).toBe('/tmp/ralph-prompt-test-uui.md')
      expect(mockWriteFileSync).toHaveBeenCalledWith(promptPath, prompt, 'utf-8')
    })

    it('omits autopilot for ralph-issues and forwards issue-specific args', () => {
      mockExistsSync.mockReturnValue(true)

      launchLoop(
        buildConfig({
          scriptType: 'ralph-issues',
          labels: 'bug,help wanted',
          dryRun: true,
        })
      )

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toEqual(expect.arrayContaining(['-Labels', 'bug,help wanted', '-DryRun']))
      expect(args).not.toContain('-Autopilot')
    })

    it('resolves template scripts from the repo when vendored copy is missing', () => {
      mockExistsSync.mockImplementation(path => {
        const filePath = normalizePath(path)
        if (filePath === '/repo') return true
        if (filePath.endsWith('/scripts/ralph-loops/scripts/repo-template.ps1')) return false
        if (filePath === '/repo/scripts/repo-template.ps1') return true
        return filePath.includes('/scripts/ralph-loops')
      })

      launchLoop(
        buildConfig({
          scriptType: 'template',
          templateScript: 'repo-template.ps1',
        })
      )

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(normalizePath(args[args.indexOf('-File') + 1])).toBe('/repo/scripts/repo-template.ps1')
    })
  })

  describe('run lifecycle and output parsing', () => {
    it('parses stdout and stderr into phases, stats, and log lines', () => {
      const onChange = vi.fn()
      setStatusChangeCallback(onChange)
      const { result, proc } = launchRunningLoop()
      const runId = result.runId!

      proc.emitStdout('\u001b[32m=== ITERATION 2\u001b[0m\n')
      proc.emitStdout(
        [
          'Handing off to ralph-pr',
          'PR review cycle',
          '== Check 1',
          'AGENT REVIEW [1]',
          'Copilot review requested',
          'review round 2',
          '  Cost $1.23 (4 premium requests)',
          'GRAND TOTAL: $4.56 (7 premium requests)',
          'Issues created this iteration: 3',
          '== Scan Iteration 1/',
        ].join('\n')
      )
      proc.emitStderr('\u001b[31mwarning\u001b[0m\n')

      const run = getLoopStatus(runId)!
      expect(run.logBuffer).toContain('=== ITERATION 2')
      expect(run.logBuffer).toContain('[stderr] warning')
      expect(run.phase).toBe('scanning')
      expect(run.currentIteration).toBe(1)
      expect(run.stats).toMatchObject({
        checks: 1,
        agentTurns: 1,
        reviews: 1,
        copilotPRs: 1,
        issuesCreated: 3,
        scanIterations: 1,
        totalCost: '$4.56',
        totalPremium: 7,
      })
      expect(onChange).toHaveBeenCalled()
    })

    it('marks runs completed when the process exits cleanly', () => {
      const { result, proc } = launchRunningLoop()
      const runId = result.runId!

      proc.emitClose(0)

      expect(getLoopStatus(runId)).toMatchObject({
        status: 'completed',
        phase: 'completed',
        exitCode: 0,
      })
    })

    it('marks runs failed when the process emits an error', () => {
      const { result, proc } = launchRunningLoop()
      const runId = result.runId!

      proc.emitError(new Error('spawn failed'))

      expect(getLoopStatus(runId)).toMatchObject({
        status: 'failed',
        phase: 'failed',
        error: 'spawn failed',
      })
    })
  })

  describe('stopLoop', () => {
    it('returns error for unknown runId', () => {
      const result = stopLoop('nonexistent-id')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Run not found')
    })

    it('stops an actively running loop', () => {
      const { result, proc } = launchRunningLoop()
      const runId = result.runId!

      expect(stopLoop(runId)).toEqual({ success: true })
      expect(getLoopStatus(runId)).toMatchObject({ status: 'cancelled', phase: 'failed' })
      if (process.platform === 'win32') {
        expect(mockExecSync).toHaveBeenCalledWith('taskkill /T /F /PID 12345', { timeout: 5000 })
      } else {
        expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
      }
    })
  })

  describe('getLoopStatus', () => {
    it('returns null for unknown runId', () => {
      expect(getLoopStatus('unknown')).toBeNull()
    })
  })

  describe('service lifecycle', () => {
    it('marks lingering running entries as orphaned on init', () => {
      const { result } = launchRunningLoop()
      const runId = result.runId!

      initRalphService()

      expect(getLoopStatus(runId)).toMatchObject({ status: 'orphaned' })
      expect(stopLoop(runId).error).toContain('not running')
    })

    it('stops all active processes and clears state on shutdown', () => {
      vi.mocked(randomUUID)
        .mockReturnValueOnce('11111111-1111-1111-1111-111111111111')
        .mockReturnValueOnce('22222222-2222-2222-2222-222222222222')
      mockExistsSync.mockReturnValue(true)

      launchLoop(buildConfig({ branch: 'feature/one' }))
      launchLoop(buildConfig({ branch: 'feature/two' }))

      shutdownRalphService()

      expect(listLoops()).toEqual([])
      if (process.platform === 'win32') {
        expect(mockExecSync).toHaveBeenCalledTimes(2)
      } else {
        expect(spawnedProcesses.every(proc => proc.kill.mock.calls.length === 1)).toBe(true)
      }
    })
  })

  describe('listTemplateScripts', () => {
    it('returns empty array when scripts subdirectory does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      expect(() => listTemplateScripts()).toThrow()
    })

    it('returns parsed scripts when directory exists with .ps1 files', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-issues.ps1', 'ralph-review.ps1'])
      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('ralph-review.ps1')) {
          return [
            '# ralph-review.ps1 — Reviews pull requests.',
            '# Version: 1.2.0',
            '$reviewPrompt = @"',
            'Review the selected pull request for bugs',
            '"@',
          ].join('\n')
        }

        return [
          '# ralph-issues.ps1 — Finds repository issues.',
          '# Version: 1.2.0',
          "& $_ralph -Prompt 'Analyze the repository for issues'",
        ].join('\n')
      })

      const scripts = listTemplateScripts()
      expect(scripts).toHaveLength(2)
      expect(scripts[0]).toMatchObject({
        filename: 'ralph-issues.ps1',
        name: 'Issues',
        description: 'Finds repository issues.',
        defaultPrompt: 'Analyze the repository for issues',
      })
      expect(scripts[1]).toMatchObject({
        filename: 'ralph-review.ps1',
        name: 'Review',
        description: 'Reviews pull requests.',
        defaultPrompt: 'Review the selected pull request for bugs',
      })
    })

    it('falls back to the next leading comment when the title description is blank', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-issues.ps1'])
      mockReadFileSync.mockReturnValue(
        "# ralph-issues.ps1 —   \n# Finds repository issues.\n# Version: 1.2.0\n& $_ralph -Prompt 'Analyze the repository for issues'"
      )

      const scripts = listTemplateScripts()

      expect(scripts[0].description).toBe('Finds repository issues.')
    })
  })
})
