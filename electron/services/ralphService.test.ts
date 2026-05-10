import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMockChildProcess = () => ({
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  kill: vi.fn(),
  pid: 12345,
})

const mockSpawn = vi.fn().mockImplementation(() => createMockChildProcess())
const mockExecSync = vi.fn().mockReturnValue('')
const mockRandomUUID = vi.fn().mockReturnValue('test-uuid-1234')

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

const mockExistsSync = vi.fn().mockReturnValue(false)
const mockReadFileSync = vi.fn().mockReturnValue('{}')
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
  randomUUID: (...args: unknown[]) => mockRandomUUID(...args),
}))

vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}))

import { join, resolve, dirname } from 'node:path'
import {
  setStatusChangeCallback,
  listLoops,
  getScriptsPath,
  launchLoop,
  stopLoop,
  getLoopStatus,
  listTemplateScripts,
  getConfig,
  initRalphService,
  shutdownRalphService,
} from './ralphService'

describe('ralphService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shutdownRalphService()
    setStatusChangeCallback(null)
    mockSpawn.mockReset()
    mockSpawn.mockImplementation(() => createMockChildProcess())
    mockExecSync.mockReset()
    mockExecSync.mockReturnValue('')
    mockRandomUUID.mockReset()
    mockRandomUUID.mockReturnValue('test-uuid-1234')
    mockExistsSync.mockReset()
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockReset()
    mockReadFileSync.mockReturnValue('{}')
    mockReaddirSync.mockReset()
    mockReaddirSync.mockReturnValue([])
    mockWriteFileSync.mockReset()
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
      const result = listLoops()
      expect(Array.isArray(result)).toBe(true)
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
        repoPath: '/nonexistent/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('does not exist')
    })

    it('returns error for forbidden characters in repoPath', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/path/with;semicolon',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('forbidden characters')
    })

    it('returns error for invalid scriptType', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'invalid' as 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid scriptType')
    })

    it('returns error when ralph-pr is missing prNumber', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph-pr',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('PR number is required')
    })

    it('returns error for iterations out of range', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        iterations: 200,
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('iterations must be between 1 and 100')
    })

    it('returns error for invalid workUntil format', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        workUntil: 'invalid',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('workUntil must be HH:mm format')
    })
  })

  describe('launchLoop - successful spawn', () => {
    it('spawns process and returns runId on valid config', () => {
      // First call: getScriptsDir (existsSync for devPath)
      // Second call: existsSync for repoPath
      // Third call: existsSync for script file
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      expect(result.runId).toBe('test-uuid-1234')
      expect(mockSpawn).toHaveBeenCalledWith(
        'pwsh',
        expect.arrayContaining(['-NoProfile', '-File']),
        expect.objectContaining({ cwd: '/valid/path', shell: false })
      )
    })
  })

  describe('stopLoop', () => {
    it('returns error for unknown runId', () => {
      const result = stopLoop('nonexistent-id')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Run not found')
    })
  })

  describe('getLoopStatus', () => {
    it('returns null for unknown runId', () => {
      expect(getLoopStatus('unknown')).toBeNull()
    })
  })

  describe('listTemplateScripts', () => {
    it('returns empty array when scripts subdirectory does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      // getScriptsDir will throw since existsSync is false
      // But listTemplateScripts checks existsSync on the scripts subdir
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

  describe('getConfig', () => {
    it('reads models config from models.json', () => {
      const modelsConfig = {
        version: '1.0.0',
        models: {
          'gpt-5': {
            label: 'GPT-5',
            costMultiplier: 1,
            provider: 'copilot',
            reasoningEffort: 'high',
          },
        },
        aliases: { fast: 'gpt-5' },
        tiers: { default: { model: 'gpt-5', description: 'Default tier' } },
        default: 'gpt-5',
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(modelsConfig))

      expect(getConfig('models')).toEqual(modelsConfig)
      expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('models.json'), 'utf-8')
    })

    it('reads agents config from agents.json', () => {
      const agentsConfig = {
        version: '1.0.0',
        defaults: { devAgent: 'anvil' },
        roles: {
          anvil: {
            category: 'dev',
            description: 'Default dev agent',
            agent: { copilot: 'anvil' },
            tier: 'default',
            skills: ['debug'],
          },
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(agentsConfig))

      expect(getConfig('agents')).toEqual(agentsConfig)
      expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('agents.json'), 'utf-8')
    })

    it('reads providers config from providers.json', () => {
      const providersConfig = {
        version: '1.0.0',
        providers: {
          copilot: {
            command: 'copilot',
            description: 'GitHub Copilot',
            promptStyle: 'flag',
            flags: { prompt: '--prompt' },
            modelTemplate: '{model}',
            supportsNativePrReview: true,
          },
        },
        default: 'copilot',
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(providersConfig))

      expect(getConfig('providers')).toEqual(providersConfig)
      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('providers.json'),
        'utf-8'
      )
    })
  })

  describe('launchLoop - template scripts', () => {
    it('resolves template scripts from the repo scripts directory', () => {
      const repoPath = '/repo'
      // getScriptsDir computes: resolve(__dirname, '..', 'scripts/ralph-loops')
      // where __dirname = dirname(fileURLToPath(import.meta.url)), mocked to '/mock/service'
      const scriptsDir = resolve(dirname('/mock/service'), '..', 'scripts/ralph-loops')
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === scriptsDir) return true
        if (filePath === repoPath) return true
        // Only the repo scripts path should exist, NOT the vendored one
        if (filePath === join(repoPath, 'scripts', 'ralph-review.ps1')) return true
        return false
      })

      const result = launchLoop({
        repoPath,
        scriptType: 'template',
        templateScript: 'ralph-review.ps1',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const [command, args, options] = mockSpawn.mock.calls[0]
      expect(command).toBe('pwsh')
      expect(args).toEqual(
        expect.arrayContaining([
          '-NoProfile',
          '-File',
          join(repoPath, 'scripts', 'ralph-review.ps1'),
          '-Autopilot',
        ])
      )
      expect(options).toMatchObject({ cwd: repoPath, shell: false })
    })

    it('returns an error when a template script cannot be found', () => {
      const repoPath = '/repo'
      const scriptsDir = resolve(dirname('/mock/service'), '..', 'scripts/ralph-loops')
      mockExistsSync.mockImplementation(
        (filePath: string) => filePath === scriptsDir || filePath === repoPath
      )

      const result = launchLoop({
        repoPath,
        scriptType: 'template',
        templateScript: 'ralph-missing.ps1',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(false)
      expect(result.error).toContain('Template script not found')
    })
  })

  describe('launchLoop - argument building', () => {
    it('wraps repeated runs and forwards optional flags', () => {
      const repoPath = '/repo'
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          version: '1.0.0',
          models: {
            'gpt-5': {
              label: 'GPT-5',
              costMultiplier: 1,
              provider: 'copilot',
              reasoningEffort: 'high',
            },
          },
          aliases: {},
          tiers: {},
          default: 'gpt-5',
        })
      )

      const result = launchLoop({
        repoPath,
        scriptType: 'ralph-pr',
        model: 'gpt-5',
        provider: 'copilot',
        devAgent: 'anvil',
        agents: ['reviewer@fast'],
        iterations: 4,
        repeats: 3,
        workUntil: '18:30',
        branch: 'feature/ralph-tests',
        prompt: 'Review this pull request',
        prNumber: 42,
        labels: 'bug,ai',
        dryRun: true,
        noAudio: true,
        skipReview: true,
        autoApprove: true,
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      expect(mockSpawn.mock.calls[0][1]).toEqual(
        expect.arrayContaining([
          '-NoProfile',
          '-File',
          expect.stringContaining('ralph-repeat.ps1'),
          '-Script',
          expect.stringContaining('ralph-pr.ps1'),
          '-Times',
          '3',
          '-Model',
          'gpt-5',
          '-Provider',
          'copilot',
          '-DevAgent',
          'anvil',
          '-Agents',
          'reviewer@fast',
          '-Max',
          '4',
          '-WorkUntil',
          '18:30',
          '-Branch',
          'feature/ralph-tests',
          '-Prompt',
          'Review this pull request',
          '-PRNumber',
          '42',
          '-Labels',
          'bug,ai',
          '-DryRun',
          '-NoAudio',
          '-SkipReview',
          '-AutoApprove',
        ])
      )
      expect(mockSpawn.mock.calls[0][1]).not.toContain('-Autopilot')
    })

    it('writes multiline prompts to a temp file before spawning', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/repo',
        scriptType: 'ralph-issues',
        prompt: 'Line 1\nLine 2',
        labels: 'triage,ai',
        dryRun: true,
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('ralph-prompt-test-uui.md'),
        'Line 1\nLine 2',
        'utf-8'
      )
      expect(mockSpawn.mock.calls[0][1]).toEqual(
        expect.arrayContaining([
          '-Prompt',
          expect.stringContaining('ralph-prompt-test-uui.md'),
          '-Labels',
          'triage,ai',
          '-DryRun',
        ])
      )
    })
  })

  describe('stopLoop - running processes', () => {
    it('uses taskkill for running Windows processes', () => {
      mockExistsSync.mockReturnValue(true)
      const launched = launchLoop({
        repoPath: '/repo',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      try {
        const result = stopLoop(launched.runId!)

        expect(result.success).toBe(true)
        expect(mockExecSync).toHaveBeenCalledWith('taskkill /T /F /PID 12345', { timeout: 5_000 })
        expect(getLoopStatus(launched.runId!)?.status).toBe('cancelled')
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it('sends SIGTERM for running non-Windows processes', () => {
      mockExistsSync.mockReturnValue(true)
      const launched = launchLoop({
        repoPath: '/repo',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const spawnedProc = mockSpawn.mock.results[0]?.value as ReturnType<
        typeof createMockChildProcess
      >

      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })

      try {
        const result = stopLoop(launched.runId!)

        expect(result.success).toBe(true)
        expect(spawnedProc.kill).toHaveBeenCalledWith('SIGTERM')
        expect(mockExecSync).not.toHaveBeenCalled()
        expect(getLoopStatus(launched.runId!)?.status).toBe('cancelled')
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })
  })

  describe('initRalphService', () => {
    it('marks running entries as orphaned', () => {
      mockExistsSync.mockReturnValue(true)
      const launched = launchLoop({
        repoPath: '/repo',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      initRalphService()

      const run = getLoopStatus(launched.runId!)
      expect(run?.status).toBe('orphaned')
      expect(run?.completedAt).not.toBeNull()
      expect(stopLoop(launched.runId!)).toMatchObject({ success: false })
    })
  })

  describe('shutdownRalphService', () => {
    it('kills active processes and clears service state', () => {
      mockExistsSync.mockReturnValue(true)
      mockRandomUUID.mockReturnValueOnce('run-1').mockReturnValueOnce('run-2')
      const first = launchLoop({
        repoPath: '/repo',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const second = launchLoop({
        repoPath: '/repo',
        scriptType: 'ralph-issues',
      } as Parameters<typeof launchLoop>[0])

      shutdownRalphService()

      expect(listLoops()).toHaveLength(0)
      expect(getLoopStatus(first.runId!)).toBeNull()
      expect(getLoopStatus(second.runId!)).toBeNull()
      if (process.platform === 'win32') {
        expect(mockExecSync).toHaveBeenCalledTimes(2)
      } else {
        const spawnedProcesses = mockSpawn.mock.results.map(
          result => result.value as ReturnType<typeof createMockChildProcess>
        )
        for (const spawnedProc of spawnedProcesses) {
          expect(spawnedProc.kill).toHaveBeenCalledWith('SIGTERM')
        }
      }
    })
  })
})
