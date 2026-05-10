import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSpawn = vi.fn().mockReturnValue({
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  kill: vi.fn(),
  pid: 12345,
})

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: vi.fn().mockReturnValue(''),
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
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}))

vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}))

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
    vi.clearAllMocks()
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

  describe('getConfig', () => {
    it('reads models config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ models: { 'gpt-4': {} }, aliases: {}, tiers: {} })
      )
      const result = getConfig('models')
      expect(result).toEqual({ models: { 'gpt-4': {} }, aliases: {}, tiers: {} })
    })

    it('reads agents config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ agents: ['agent-1'] }))
      const result = getConfig('agents')
      expect(result).toEqual({ agents: ['agent-1'] })
    })

    it('reads providers config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ providers: ['copilot'] }))
      const result = getConfig('providers')
      expect(result).toEqual({ providers: ['copilot'] })
    })

    it('throws when config file does not exist', () => {
      mockExistsSync.mockImplementation((p: string) => {
        // Scripts dir exists, but config file does not
        return typeof p === 'string' && !p.includes('config')
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

    it('returns error for repeats out of range', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        repeats: 100,
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('repeats must be between 1 and 50')
    })

    it('returns error for invalid provider', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        provider: 'invalid-provider' as 'copilot',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid provider')
    })
  })

  describe('launchLoop - successful spawn', () => {
    it('spawns process and returns runId on valid config', () => {
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

    it('spawns ralph-pr with prNumber and devAgent', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph-pr',
        prNumber: 42,
        devAgent: 'claude',
        agents: ['reviewer'],
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      expect(mockSpawn).toHaveBeenCalledWith(
        'pwsh',
        expect.arrayContaining(['-PRNumber', '42', '-DevAgent', 'claude', '-Agents', 'reviewer']),
        expect.anything()
      )
    })

    it('spawns ralph-issues without -Autopilot flag', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph-issues',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      expect(spawnArgs).not.toContain('-Autopilot')
    })

    it('includes optional flags when provided', () => {
      mockExistsSync.mockReturnValue(true)
      // getConfig('models') needs a valid JSON with models/aliases/tiers
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          models: { 'gpt-4': { provider: 'copilot' } },
          aliases: {},
          tiers: {},
        })
      )

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        model: 'gpt-4',
        provider: 'copilot',
        iterations: 5,
        workUntil: '17:00',
        branch: 'feature/test',
        prompt: 'Fix bugs',
        noAudio: true,
        skipReview: true,
        autoApprove: true,
        noPR: true,
        labels: 'bug,fix',
        dryRun: true,
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      expect(spawnArgs).toContain('-Model')
      expect(spawnArgs).toContain('gpt-4')
      expect(spawnArgs).toContain('-Provider')
      expect(spawnArgs).toContain('copilot')
      expect(spawnArgs).toContain('-Max')
      expect(spawnArgs).toContain('5')
      expect(spawnArgs).toContain('-WorkUntil')
      expect(spawnArgs).toContain('17:00')
      expect(spawnArgs).toContain('-Branch')
      expect(spawnArgs).toContain('feature/test')
      expect(spawnArgs).toContain('-Prompt')
      expect(spawnArgs).toContain('-NoAudio')
      expect(spawnArgs).toContain('-SkipReview')
      expect(spawnArgs).toContain('-AutoApprove')
      expect(spawnArgs).toContain('-NoPR')
      expect(spawnArgs).toContain('-Labels')
      expect(spawnArgs).toContain('bug,fix')
      expect(spawnArgs).toContain('-DryRun')
    })

    it('writes long prompts to temp file', () => {
      mockExistsSync.mockReturnValue(true)

      const longPrompt = 'a'.repeat(600)
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        prompt: longPrompt,
      } as Parameters<typeof launchLoop>[0])

      // Should have written to file instead of passing inline
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('writes multi-line prompts to temp file', () => {
      mockExistsSync.mockReturnValue(true)

      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        prompt: 'line1\nline2\nline3',
      } as Parameters<typeof launchLoop>[0])

      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('spawns with repeat wrapper when repeats > 1', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        repeats: 3,
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      expect(spawnArgs).toContain('-Script')
      expect(spawnArgs).toContain('-Times')
      expect(spawnArgs).toContain('3')
    })

    it('handles process stdout and parses output lines', () => {
      mockExistsSync.mockReturnValue(true)
      const stdoutCallbacks: ((data: Buffer) => void)[] = []
      const stderrCallbacks: ((data: Buffer) => void)[] = []
      const closeCallbacks: ((code: number) => void)[] = []
      const errorCallbacks: ((err: Error) => void)[] = []

      mockSpawn.mockReturnValue({
        stdout: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stdoutCallbacks.push(cb)
          }),
        },
        stderr: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stderrCallbacks.push(cb)
          }),
        },
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'close') closeCallbacks.push(cb as (code: number) => void)
          if (event === 'error') errorCallbacks.push(cb as (err: Error) => void)
        }),
        kill: vi.fn(),
        pid: 12345,
      })

      const statusCb = vi.fn()
      setStatusChangeCallback(statusCb)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)

      // Simulate stdout with iteration markers
      stdoutCallbacks[0](Buffer.from('=== ITERATION 1\n'))
      expect(statusCb).toHaveBeenCalled()

      // Simulate stat tracking — check marker
      statusCb.mockClear()
      stdoutCallbacks[0](Buffer.from('== Check 1 of 5\n'))
      expect(statusCb).toHaveBeenCalled()

      // Simulate stderr
      stderrCallbacks[0](Buffer.from('warning message\n'))

      // Simulate process exit with success
      statusCb.mockClear()
      closeCallbacks[0](0)
      expect(statusCb).toHaveBeenCalled()

      // Reset
      setStatusChangeCallback(null)
    })

    it('handles process error event', () => {
      mockExistsSync.mockReturnValue(true)
      const errorCallbacks: ((err: Error) => void)[] = []

      mockSpawn.mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') errorCallbacks.push(cb as (err: Error) => void)
        }),
        kill: vi.fn(),
        pid: 12345,
      })

      const statusCb = vi.fn()
      setStatusChangeCallback(statusCb)

      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      // Simulate process error
      errorCallbacks[0](new Error('spawn failed'))
      expect(statusCb).toHaveBeenCalled()

      setStatusChangeCallback(null)
    })

    it('parses PR handoff and review cycle phase markers', () => {
      mockExistsSync.mockReturnValue(true)
      const stdoutCallbacks: ((data: Buffer) => void)[] = []

      mockSpawn.mockReturnValue({
        stdout: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stdoutCallbacks.push(cb)
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 12345,
      })

      const statusCb = vi.fn()
      setStatusChangeCallback(statusCb)

      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      // PR handoff phase
      stdoutCallbacks[0](Buffer.from('Handing off to ralph-pr\n'))
      expect(statusCb).toHaveBeenCalled()

      // PR resolving phase
      statusCb.mockClear()
      stdoutCallbacks[0](Buffer.from('Checking CI status\n'))
      expect(statusCb).toHaveBeenCalled()

      // Scan iteration markers (ralph-issues)
      statusCb.mockClear()
      stdoutCallbacks[0](Buffer.from('== Scan Iteration 1/3\n'))
      expect(statusCb).toHaveBeenCalled()

      setStatusChangeCallback(null)
    })

    it('parses stat matchers: agent review, copilot PR, review round, cost, issues', () => {
      mockExistsSync.mockReturnValue(true)
      const stdoutCallbacks: ((data: Buffer) => void)[] = []

      mockSpawn.mockReturnValue({
        stdout: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') stdoutCallbacks.push(cb)
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 12345,
      })

      setStatusChangeCallback(vi.fn())

      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      stdoutCallbacks[0](Buffer.from('AGENT REVIEW [claude]\n'))
      stdoutCallbacks[0](Buffer.from('Copilot review requested for PR #42\n'))
      stdoutCallbacks[0](Buffer.from('review round 1 complete\n'))
      stdoutCallbacks[0](Buffer.from('  Cost $1.23 (5 premium requests)\n'))
      stdoutCallbacks[0](Buffer.from('GRAND TOTAL: $4.56 (10 premium requests used)\n'))
      stdoutCallbacks[0](Buffer.from('Issues created this iteration: 3\n'))

      const status = getLoopStatus('test-uuid-1234')
      expect(status).not.toBeNull()
      expect(status!.stats.agentTurns).toBeGreaterThanOrEqual(1)
      expect(status!.stats.copilotPRs).toBeGreaterThanOrEqual(1)
      expect(status!.stats.reviews).toBeGreaterThanOrEqual(1)
      expect(status!.stats.totalCost).toBe('$4.56')
      expect(status!.stats.totalPremium).toBe(10)
      expect(status!.stats.issuesCreated).toBeGreaterThanOrEqual(3)

      setStatusChangeCallback(null)
    })
  })

  describe('stopLoop', () => {
    it('returns error for unknown runId', () => {
      const result = stopLoop('nonexistent-id')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Run not found')
    })

    it('returns error when run is not in running state', () => {
      mockExistsSync.mockReturnValue(true)
      const closeCallbacks: ((code: number) => void)[] = []
      mockSpawn.mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'close') closeCallbacks.push(cb as (code: number) => void)
        }),
        kill: vi.fn(),
        pid: 12345,
      })

      const launchResult = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      // Simulate process completion
      closeCallbacks[0](0)

      const result = stopLoop(launchResult.runId!)
      expect(result.success).toBe(false)
      expect(result.error).toContain('is not running')
    })
  })

  describe('getLoopStatus', () => {
    it('returns null for unknown runId', () => {
      expect(getLoopStatus('unknown')).toBeNull()
    })
  })

  describe('initRalphService', () => {
    it('does not throw when no active runs', () => {
      expect(() => initRalphService()).not.toThrow()
    })
  })

  describe('shutdownRalphService', () => {
    it('does not throw when no active processes', () => {
      expect(() => shutdownRalphService()).not.toThrow()
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

    it('filters out -repeat and -run-all scripts', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-issues.ps1', 'ralph-repeat.ps1', 'ralph-run-all.ps1'])
      mockReadFileSync.mockReturnValue('# ralph-issues.ps1 — Finds issues.')

      const scripts = listTemplateScripts()
      expect(scripts).toHaveLength(1)
      expect(scripts[0].filename).toBe('ralph-issues.ps1')
    })

    it('handles scripts with no leading comment gracefully', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-custom.ps1'])
      mockReadFileSync.mockReturnValue('param([string]$Prompt)\n& $_ralph -Prompt $Prompt')

      const scripts = listTemplateScripts()
      expect(scripts).toHaveLength(1)
      expect(scripts[0].description).toBeUndefined()
    })

    it('handles readScriptContent returning null on read error', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-broken.ps1'])
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES')
      })

      const scripts = listTemplateScripts()
      expect(scripts).toHaveLength(1)
      expect(scripts[0].description).toBeUndefined()
      expect(scripts[0].defaultPrompt).toBeUndefined()
    })
  })
})
